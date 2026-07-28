-- Stock processes, wired into the documents ALREADY live in the database.
--
-- The live schema has its own purchasing flow (purchase_orders, statuses
-- draft → rfq_sent → quote_received → confirmed → ordered → received →
-- invoiced → paid) and its own sales flow (orders, states brouillon →
-- confirmee → en_preparation → livree → facturee → payee, with qty_delivered
-- and delivery_status per line). Rather than creating a parallel circuit,
-- stock plugs into those documents:
--
--   reception  : receive_purchase_order(po, warehouse)  => + destination
--   transfer   : execute_stock_transfer(transfer)       => - source, + destination
--   delivery   : deliver_order(order, warehouse [, lines]) => - source
--
-- Creating or confirming a document never moves stock. Reception, transfer
-- execution and delivery are the only paths, each atomic in plpgsql, plus the
-- note-mandatory manual entry from 0004.

-- ---------------------------------------------------------------------------
-- Purchase orders: destination warehouse + reception timestamp
-- ---------------------------------------------------------------------------
alter table public.purchase_orders
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;
alter table public.purchase_orders
  add column if not exists received_at timestamptz;

comment on column public.purchase_orders.warehouse_id is
  'Destination warehouse: where the goods land when the order is received.';

-- Reception: the goods land in the destination warehouse. Callable from any
-- pre-reception status; pass the warehouse if it was not set on the document.
create or replace function public.receive_purchase_order(
  p_order_id     uuid,
  p_warehouse_id uuid default null
) returns public.purchase_orders language plpgsql as $$
declare
  v_order     public.purchase_orders;
  v_warehouse uuid;
  v_lines     int;
begin
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Purchase order not found';
  end if;
  if v_order.status in ('received', 'invoiced', 'paid') then
    raise exception 'Purchase order % has already been received', coalesce(v_order.reference, p_order_id::text);
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Purchase order % is cancelled', coalesce(v_order.reference, p_order_id::text);
  end if;

  v_warehouse := coalesce(p_warehouse_id, v_order.warehouse_id);
  if v_warehouse is null then
    raise exception 'Choose the destination warehouse before receiving';
  end if;

  select count(*) into v_lines
    from public.purchase_order_lines
   where purchase_order_id = p_order_id and product_id is not null;
  if v_lines = 0 then
    raise exception 'Purchase order % has no article lines to receive', coalesce(v_order.reference, p_order_id::text);
  end if;

  insert into public.stock_movements
    (product_id, warehouse_id, quantity, reason, purchase_order_id, note)
  select l.product_id, v_warehouse, l.quantity, 'reception', v_order.id,
         'Réception ' || coalesce(v_order.reference, '')
    from public.purchase_order_lines l
   where l.purchase_order_id = p_order_id and l.product_id is not null;

  update public.purchase_orders
     set status = 'received', received_at = now(), warehouse_id = v_warehouse
   where id = p_order_id
  returning * into v_order;

  return v_order;
end $$;

-- ---------------------------------------------------------------------------
-- Transfers between warehouses
-- ---------------------------------------------------------------------------
create sequence if not exists public.stock_transfer_ref_seq;

create table if not exists public.stock_transfers (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique
                      default 'TR-' || to_char(now(), 'YYYY') || '-'
                              || lpad(nextval('public.stock_transfer_ref_seq')::text, 4, '0'),
  from_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  to_warehouse_id   uuid not null references public.warehouses(id) on delete restrict,
  status            text not null default 'draft'
                      check (status in ('draft', 'done', 'cancelled')),
  transfer_date     date not null default current_date,
  executed_at       timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (from_warehouse_id <> to_warehouse_id)
);

create table if not exists public.stock_transfer_lines (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id  uuid not null references public.products(id)        on delete restrict,
  quantity    numeric(14,3) not null check (quantity > 0),
  unique (transfer_id, product_id)
);

create index if not exists stock_transfer_lines_transfer_idx
  on public.stock_transfer_lines(transfer_id);

-- Transfer: stock leaves one warehouse and enters another, atomically.
create or replace function public.execute_stock_transfer(p_transfer_id uuid)
returns public.stock_transfers language plpgsql as $$
declare
  v_transfer public.stock_transfers;
  v_lines int;
  v_short record;
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

  insert into public.stock_movements
    (product_id, warehouse_id, quantity, reason, note)
  select l.product_id, v_transfer.from_warehouse_id, -l.quantity, 'transfer_out',
         'Transfert ' || v_transfer.reference
    from public.stock_transfer_lines l
   where l.transfer_id = p_transfer_id;

  insert into public.stock_movements
    (product_id, warehouse_id, quantity, reason, note)
  select l.product_id, v_transfer.to_warehouse_id, l.quantity, 'transfer_in',
         'Transfert ' || v_transfer.reference
    from public.stock_transfer_lines l
   where l.transfer_id = p_transfer_id;

  update public.stock_transfers
     set status = 'done', executed_at = now()
   where id = p_transfer_id
  returning * into v_transfer;

  return v_transfer;
end $$;

drop trigger if exists stock_transfers_updated_at on public.stock_transfers;
create trigger stock_transfers_updated_at before update on public.stock_transfers
  for each row execute function public.set_updated_at();

alter table public.stock_transfers      enable row level security;
alter table public.stock_transfer_lines enable row level security;

drop policy if exists "authenticated full access" on public.stock_transfers;
create policy "authenticated full access" on public.stock_transfers
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.stock_transfer_lines;
create policy "authenticated full access" on public.stock_transfer_lines
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Customer orders: source warehouse + delivery
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;
alter table public.orders
  add column if not exists delivered_at timestamptz;

comment on column public.orders.warehouse_id is
  'Source warehouse: where the goods leave from when the order is delivered.';

-- Delivery: decrements the source warehouse for what has not been delivered
-- yet. Supports partial deliveries through the qty_delivered / delivery_status
-- columns the live schema already tracks per line:
--   * p_lines null            => deliver everything still owed on every line
--   * p_lines [{line_id, quantity}, …] => deliver those quantities only
-- The order state follows: 'livree' when nothing is owed anymore, otherwise
-- 'en_preparation'. States facturee/payee are downstream of livree and are
-- never touched here.
create or replace function public.deliver_order(
  p_order_id     uuid,
  p_warehouse_id uuid default null,
  p_lines        jsonb default null
) returns public.orders language plpgsql as $$
declare
  v_order     public.orders;
  v_warehouse uuid;
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
      (product_id, warehouse_id, quantity, reason, order_id, note)
    values (v_row.product_id, v_warehouse, -v_qty, 'delivery', p_order_id,
            'Livraison ' || coalesce(v_order.reference, ''));

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

-- Cancelling a delivery: the goods come back into the warehouse they left.
-- The ledger stays append-only — the return is a new movement, and the line
-- counters are wound back so the order can be delivered again correctly.
create or replace function public.return_order_delivery(
  p_order_id uuid,
  p_note     text
) returns public.orders language plpgsql as $$
declare
  v_order public.orders;
  v_row   record;
  v_count int := 0;
begin
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'A return requires a note explaining the reason';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  -- What went out per (product, warehouse) minus what already came back.
  for v_row in
    select m.product_id, m.warehouse_id, -sum(m.quantity) as qty_out
      from public.stock_movements m
     where m.order_id = p_order_id and m.reason in ('delivery', 'return')
     group by m.product_id, m.warehouse_id
    having sum(m.quantity) < 0
  loop
    insert into public.stock_movements
      (product_id, warehouse_id, quantity, reason, order_id, note)
    values (v_row.product_id, v_row.warehouse_id, v_row.qty_out, 'return', p_order_id,
            'Retour ' || coalesce(v_order.reference, '') || ' — ' || btrim(p_note));
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Order % has no delivered stock to take back', coalesce(v_order.reference, p_order_id::text);
  end if;

  update public.order_lines
     set qty_delivered = 0, delivery_status = 'a_livrer'
   where order_id = p_order_id;

  update public.orders
     set state = 'confirmee', delivered_at = null
   where id = p_order_id
  returning * into v_order;

  return v_order;
end $$;
