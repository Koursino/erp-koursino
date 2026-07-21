-- 0003_sales_orders.sql — Commandes revendeurs (reseller sales orders), Odoo-style
-- (sale.order / sale.order.line). STEP 1 = order skeleton.
-- Reuses public.companies (le revendeur) and public.products (catalogue).
--
-- FUTURE HOOKS (designed here, NOT implemented — later phases):
--   * Stock: availability check at confirmation lives in the confirmOrder server action
--     (no-op today; never blocks). The Stock module does not exist yet.
--   * Price-lists: reseller tiered pricing will pre-fill order_lines.unit_price_ht; the line
--     still SNAPSHOTS the price, so a later catalog/price-list change never rewrites a past order.
--   * Deliveries (BL): order_lines.qty_delivered / delivery_status are present but NOT yet
--     driven; a future deliveries table will FK order_lines(id).
--   * Invoices: a future invoices table will FK orders(id); orders.reference is the legal number.
--   * Audit log: a future table will record state transitions (created_by / confirmed_at ready).

-- ---------------------------------------------------------------------------
-- Yearly numbering sequence — KRS-<year>-00001, assigned AT CONFIRMATION.
-- ---------------------------------------------------------------------------
create table public.order_sequences (
  year       int primary key,
  last_value int not null default 0
);

alter table public.order_sequences enable row level security;
create policy "authenticated full access" on public.order_sequences
  for all to authenticated using (true) with check (true);

-- Atomic, race-safe next number. Year pinned to Casablanca so it never flips at UTC midnight.
create or replace function public.next_order_reference()
returns text language plpgsql as $$
declare
  v_year int := extract(year from (now() at time zone 'Africa/Casablanca'))::int;
  v_seq  int;
begin
  insert into public.order_sequences (year, last_value)
  values (v_year, 1)
  on conflict (year) do update
    set last_value = public.order_sequences.last_value + 1
  returning last_value into v_seq;

  return 'KRS-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Orders (header) — one2many with order_lines, façon sale.order.
-- ---------------------------------------------------------------------------
create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique,                         -- NULL until confirmed; immutable after (KRS-YYYY-NNNNN)
  company_id   uuid not null references public.companies(id) on delete restrict,  -- le revendeur
  deal_id      uuid references public.deals(id) on delete set null,               -- optional CRM link (loose coupling)
  state        text not null default 'brouillon'
                 check (state in ('brouillon','confirmee','en_preparation','livree','facturee','payee','annulee')),
  order_date   date not null default current_date,
  notes        text,                                -- notes internes
  currency     text not null default 'MAD',
  total_ht     numeric(12,2) not null default 0,    -- maintained by recompute_order_totals()
  total_tva    numeric(12,2) not null default 0,    -- maintained by recompute_order_totals()
  total_ttc    numeric(12,2) not null default 0,    -- maintained by recompute_order_totals()
  confirmed_at timestamptz,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null, -- ownership; roles deferred
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index orders_company_id_idx on public.orders(company_id);
create index orders_state_idx      on public.orders(state);
create index orders_deal_id_idx    on public.orders(deal_id);
create index orders_created_by_idx on public.orders(created_by);

-- ---------------------------------------------------------------------------
-- Order lines (one2many). Prices/désignation are SNAPSHOTTED from the catalog at add-time
-- (no live join) so later catalog price changes never rewrite historical orders.
-- ---------------------------------------------------------------------------
create table public.order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id)   on delete cascade,   -- lines die with the order
  product_id       uuid not null references public.products(id) on delete restrict,  -- protect referenced products
  description      text not null,                                    -- snapshot of the product name
  unit_price_ht    numeric(12,2) not null check (unit_price_ht >= 0), -- snapshot (default catalog price, overridable)
  vat_rate         numeric(5,2)  not null default 20 check (vat_rate between 0 and 100), -- snapshot
  quantity         numeric(12,3) not null default 1 check (quantity > 0),
  discount_percent numeric(5,2)  not null default 0 check (discount_percent between 0 and 100),
  -- STORED generated column — references base same-row columns only. discount_percent is numeric,
  -- so /100 is NOT integer-truncated. (A generated column cannot reference vat_rate via subtotal.)
  subtotal_ht      numeric(12,2) generated always as
                     (round(quantity * unit_price_ht * (1 - discount_percent / 100), 2)) stored,
  position         int not null default 0,
  -- Delivery hooks — present, NOT yet driven (Stock / BL phase):
  qty_delivered    numeric(12,3) not null default 0,
  delivery_status  text not null default 'a_livrer'
                     check (delivery_status in ('a_livrer','partiel','livre')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index order_lines_order_id_idx   on public.order_lines(order_id);
create index order_lines_product_id_idx on public.order_lines(product_id);

-- ---------------------------------------------------------------------------
-- Header totals — recomputed from the lines on every line change.
-- VAT is rounded per line then summed, so the header reconciles with the printed lines
-- (Moroccan invoicing practice). total_ttc = total_ht + total_tva.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_order_totals()
returns trigger language plpgsql as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o set
    total_ht  = coalesce(t.ht, 0),
    total_tva = coalesce(t.tva, 0),
    total_ttc = coalesce(t.ht, 0) + coalesce(t.tva, 0)
  from (
    select sum(subtotal_ht)                            as ht,
           sum(round(subtotal_ht * vat_rate / 100, 2)) as tva
    from public.order_lines
    where order_id = v_order_id
  ) t
  where o.id = v_order_id;

  -- Rare: a line was reparented to another order — refresh the previous parent too.
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    update public.orders o set
      total_ht  = coalesce(t.ht, 0),
      total_tva = coalesce(t.tva, 0),
      total_ttc = coalesce(t.ht, 0) + coalesce(t.tva, 0)
    from (
      select sum(subtotal_ht)                            as ht,
             sum(round(subtotal_ht * vat_rate / 100, 2)) as tva
      from public.order_lines
      where order_id = old.order_id
    ) t
    where o.id = old.order_id;
  end if;

  return null; -- AFTER trigger: return value ignored
end $$;

create trigger order_lines_totals
  after insert or update or delete on public.order_lines
  for each row execute function public.recompute_order_totals();

-- updated_at maintenance (reuse the shared function from 0001).
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger order_lines_updated_at before update on public.order_lines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: single-team MVP — any authenticated user has full access (roles deferred).
-- ---------------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.order_lines enable row level security;
create policy "authenticated full access" on public.orders
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.order_lines
  for all to authenticated using (true) with check (true);
