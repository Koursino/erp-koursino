-- Bons de livraison: a real delivery document, numbered, with a driver.
--
-- Why this migration exists
-- -------------------------
-- Until now there was no delivery entity at all. The printable BL was derived
-- from the order (BL-KRS-2026-00001) and listed the ORDERED quantities, so a
-- partial delivery printed a document that did not match what left the
-- warehouse. Three things were asked for:
--
--   * "Je souhaite uniformiser la codification des bons de livraison"
--       001-DB/2026      → 1st delivery of 2026, shipped from warehouse DB
--       002-US-DB/2026   → 2nd delivery of 2026, moved from US to DB
--     One yearly counter shared by customer deliveries and warehouse
--     transfers, restarting at 001 each year.
--   * "Je souhaite un livreur à chaque livraison" — hence `drivers`, and a
--     driver that the delivery functions refuse to do without.
--   * "Générer un bon de livraison PDF (de la même manière que sur les ventes)"
--     for transfers too, which is what the second example is.
--
-- The ledger keeps its rules: `stock_movements` stays append-only, so the
-- delivery note is created BEFORE its movements and each movement is stamped
-- with `delivery_id` on insert — never updated afterwards.

-- ---------------------------------------------------------------------------
-- Livreurs
-- ---------------------------------------------------------------------------
create table if not exists public.drivers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists drivers_updated_at on public.drivers;
create trigger drivers_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Yearly numbering — 001-DB/2026, 002-US-DB/2026
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_sequences (
  year       int primary key,
  last_value int not null default 0
);

-- Atomic and race-safe, like next_order_reference(). The year is pinned to
-- Casablanca so the series never rolls over at UTC midnight.
create or replace function public.next_delivery_reference(
  p_from_code text,
  p_to_code   text default null
) returns text language plpgsql as $$
declare
  v_year int := extract(year from (now() at time zone 'Africa/Casablanca'))::int;
  v_seq  int;
  v_path text;
begin
  if coalesce(btrim(p_from_code), '') = '' then
    raise exception 'The delivery needs a source warehouse code';
  end if;

  v_path := public.stock_code_fragment(p_from_code);
  if p_to_code is not null and btrim(p_to_code) <> '' then
    v_path := v_path || '-' || public.stock_code_fragment(p_to_code);
  end if;

  insert into public.delivery_sequences (year, last_value)
  values (v_year, 1)
  on conflict (year) do update
    set last_value = public.delivery_sequences.last_value + 1
  returning last_value into v_seq;

  return lpad(v_seq::text, 3, '0') || '-' || v_path || '/' || v_year;
end $$;

-- ---------------------------------------------------------------------------
-- Bons de livraison
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_notes (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  kind              text not null check (kind in ('customer', 'transfer')),
  order_id          uuid references public.orders(id)          on delete restrict,
  transfer_id       uuid references public.stock_transfers(id) on delete restrict,
  from_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  to_warehouse_id   uuid references public.warehouses(id)         on delete restrict,
  driver_id         uuid not null references public.drivers(id)   on delete restrict,
  delivered_at      timestamptz not null default now(),
  note              text,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  -- Exactly one source document, matching the kind.
  constraint delivery_notes_source_check check (
    (kind = 'customer' and order_id is not null and transfer_id is null and to_warehouse_id is null)
    or
    (kind = 'transfer' and transfer_id is not null and order_id is null and to_warehouse_id is not null)
  )
);

create index if not exists delivery_notes_order_idx    on public.delivery_notes(order_id);
create index if not exists delivery_notes_transfer_idx on public.delivery_notes(transfer_id);
create index if not exists delivery_notes_date_idx     on public.delivery_notes(delivered_at desc);

-- What actually left the warehouse on that document. A return posted later is
-- a movement of its own and is deliberately NOT attached to a delivery note:
-- with several partial deliveries there is no single BL it belongs to.
alter table public.stock_movements
  add column if not exists delivery_id uuid references public.delivery_notes(id) on delete restrict;

create index if not exists stock_movements_delivery_idx on public.stock_movements(delivery_id);

-- ---------------------------------------------------------------------------
-- Delivery: same behaviour as 0007, plus the delivery note
-- ---------------------------------------------------------------------------
-- Adding a defaulted parameter would create an ambiguous overload, so the old
-- signature is dropped first.
drop function if exists public.deliver_order(uuid, uuid, jsonb);

create or replace function public.deliver_order(
  p_order_id     uuid,
  p_warehouse_id uuid default null,
  p_lines        jsonb default null,
  p_driver_id    uuid default null
) returns public.orders language plpgsql as $$
declare
  v_order     public.orders;
  v_warehouse uuid;
  v_code      text;
  v_delivery  public.delivery_notes;
  v_row       record;
  v_qty       numeric;
  v_available numeric;
  v_delivered int := 0;
  v_remaining numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.state = 'annulee' then
    raise exception 'Order % is cancelled', coalesce(v_order.reference, p_order_id::text);
  end if;
  if v_order.state = 'brouillon' then
    raise exception 'Confirm order % before delivering it', coalesce(v_order.reference, p_order_id::text);
  end if;

  v_warehouse := coalesce(p_warehouse_id, v_order.warehouse_id);
  if v_warehouse is null then
    raise exception 'Choose the source warehouse before delivering';
  end if;

  if p_driver_id is null then
    raise exception 'Sélectionnez le livreur : chaque livraison en porte un';
  end if;

  select code into v_code from public.warehouses where id = v_warehouse;

  -- Created first: the ledger is append-only, so movements carry their
  -- delivery_id from the start. A failure below rolls the whole thing back,
  -- counter included.
  insert into public.delivery_notes
    (reference, kind, order_id, from_warehouse_id, driver_id, note)
  values (public.next_delivery_reference(v_code), 'customer', p_order_id, v_warehouse,
          p_driver_id, 'Livraison ' || coalesce(v_order.reference, ''))
  returning * into v_delivery;

  for v_row in
    select l.id, l.product_id, p.sku,
           (l.quantity - l.qty_delivered) as owed,
           requested.quantity as requested_qty
      from public.order_lines l
      join public.products p on p.id = l.product_id
      left join lateral (
        select (elem->>'quantity')::numeric as quantity
          from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) elem
         where (elem->>'line_id')::uuid = l.id
      ) requested on true
     where l.order_id = p_order_id
       and l.quantity > l.qty_delivered
       and (p_lines is null or requested.quantity is not null)
     order by l.position
     for update of l
  loop
    v_qty := coalesce(v_row.requested_qty, v_row.owed);
    if v_qty <= 0 then
      continue;
    end if;
    if v_qty > v_row.owed then
      raise exception '% : % requested but only % still owed on this line',
        v_row.sku, v_qty, v_row.owed;
    end if;

    select quantity into v_available
      from public.stock_levels
     where product_id = v_row.product_id and warehouse_id = v_warehouse
       for update;

    if coalesce(v_available, 0) < v_qty then
      raise exception 'Not enough stock for % in this warehouse: % needed, % available',
        v_row.sku, v_qty, coalesce(v_available, 0);
    end if;

    insert into public.stock_movements
      (product_id, warehouse_id, quantity, reason, order_id, delivery_id, note)
    values (v_row.product_id, v_warehouse, -v_qty, 'delivery', p_order_id, v_delivery.id,
            'Livraison ' || v_delivery.reference);

    update public.order_lines
       set qty_delivered   = qty_delivered + v_qty,
           delivery_status = case when qty_delivered + v_qty >= quantity
                                  then 'livre' else 'partiel' end
     where id = v_row.id;

    v_delivered := v_delivered + 1;
  end loop;

  if v_delivered = 0 then
    raise exception 'Nothing to deliver on order %', coalesce(v_order.reference, p_order_id::text);
  end if;

  select coalesce(sum(quantity - qty_delivered), 0) into v_remaining
    from public.order_lines where order_id = p_order_id;

  update public.orders
     set state        = case when v_remaining = 0 then 'livree' else 'en_preparation' end,
         delivered_at = case when v_remaining = 0 then now() else delivered_at end,
         warehouse_id = v_warehouse
   where id = p_order_id
  returning * into v_order;

  return v_order;
end $$;

-- ---------------------------------------------------------------------------
-- Transfer: same behaviour as 0007, plus the delivery note
-- ---------------------------------------------------------------------------
drop function if exists public.execute_stock_transfer(uuid);

create or replace function public.execute_stock_transfer(
  p_transfer_id uuid,
  p_driver_id   uuid default null
) returns public.stock_transfers language plpgsql as $$
declare
  v_transfer public.stock_transfers;
  v_delivery public.delivery_notes;
  v_from     text;
  v_to       text;
  v_lines    int;
  v_short    record;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'Transfer not found';
  end if;
  if v_transfer.status = 'done' then
    raise exception 'Transfer % has already been executed', v_transfer.reference;
  end if;
  if v_transfer.status = 'cancelled' then
    raise exception 'Transfer % is cancelled', v_transfer.reference;
  end if;

  if p_driver_id is null then
    raise exception 'Sélectionnez le livreur : chaque livraison en porte un';
  end if;

  select count(*) into v_lines
    from public.stock_transfer_lines where transfer_id = p_transfer_id;
  if v_lines = 0 then
    raise exception 'Transfer % has no lines', v_transfer.reference;
  end if;

  -- Lock the levels involved so two concurrent executions cannot both pass
  -- the availability check.
  perform 1
     from public.stock_levels s
    where s.warehouse_id in (v_transfer.from_warehouse_id, v_transfer.to_warehouse_id)
      and s.product_id in (select product_id from public.stock_transfer_lines
                            where transfer_id = p_transfer_id)
      for update;

  select p.sku, l.quantity as needed, coalesce(s.quantity, 0) as available
    into v_short
    from public.stock_transfer_lines l
    join public.products p on p.id = l.product_id
    left join public.stock_levels s
      on s.product_id = l.product_id and s.warehouse_id = v_transfer.from_warehouse_id
   where l.transfer_id = p_transfer_id
     and coalesce(s.quantity, 0) < l.quantity
   limit 1;

  if found then
    raise exception 'Not enough stock for % in the source warehouse: % needed, % available',
      v_short.sku, v_short.needed, v_short.available;
  end if;

  select code into v_from from public.warehouses where id = v_transfer.from_warehouse_id;
  select code into v_to   from public.warehouses where id = v_transfer.to_warehouse_id;

  insert into public.delivery_notes
    (reference, kind, transfer_id, from_warehouse_id, to_warehouse_id, driver_id, note)
  values (public.next_delivery_reference(v_from, v_to), 'transfer', p_transfer_id,
          v_transfer.from_warehouse_id, v_transfer.to_warehouse_id, p_driver_id,
          'Transfert ' || v_transfer.reference)
  returning * into v_delivery;

  insert into public.stock_movements
    (product_id, warehouse_id, quantity, reason, delivery_id, note)
  select l.product_id, v_transfer.from_warehouse_id, -l.quantity, 'transfer_out',
         v_delivery.id, 'Transfert ' || v_transfer.reference
    from public.stock_transfer_lines l
   where l.transfer_id = p_transfer_id;

  insert into public.stock_movements
    (product_id, warehouse_id, quantity, reason, delivery_id, note)
  select l.product_id, v_transfer.to_warehouse_id, l.quantity, 'transfer_in',
         v_delivery.id, 'Transfert ' || v_transfer.reference
    from public.stock_transfer_lines l
   where l.transfer_id = p_transfer_id;

  update public.stock_transfers
     set status = 'done', executed_at = now()
   where id = p_transfer_id
  returning * into v_transfer;

  return v_transfer;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security: same single-team policy as the rest of the schema.
-- ---------------------------------------------------------------------------
alter table public.drivers            enable row level security;
alter table public.delivery_notes     enable row level security;
alter table public.delivery_sequences enable row level security;

drop policy if exists "authenticated full access" on public.drivers;
create policy "authenticated full access" on public.drivers
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.delivery_notes;
create policy "authenticated full access" on public.delivery_notes
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.delivery_sequences;
create policy "authenticated full access" on public.delivery_sequences
  for all to authenticated using (true) with check (true);
