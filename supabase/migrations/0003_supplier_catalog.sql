-- Purchasing module (Achats) — supplier catalog.
-- Layers on the shared public.products table (created in 0002_products_catalog.sql)
-- and public.companies (0001). A supplier is a company with is_supplier = true.
-- See docs/adr-002-purchasing-module.md.
--
-- Note: products.unit_price_ht/ttc is the SALE price (what Koursino sells for).
-- supplier_catalog.unit_price is the PURCHASE price (what a supplier charges us) —
-- a distinct number, per supplier, hence its own column here.

create table public.supplier_catalog (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references public.companies(id) on delete cascade,
  product_id     uuid not null references public.products(id)  on delete cascade,
  supplier_ref   text,                                       -- supplier's own product code
  unit_price     numeric(12,2) check (unit_price >= 0),      -- purchase price
  currency       text not null default 'MAD',
  lead_time_days int check (lead_time_days >= 0),            -- delivery lead time
  min_order_qty  numeric(12,2) not null default 1 check (min_order_qty >= 0),
  is_preferred   boolean not null default false,             -- preferred supplier for this product
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (supplier_id, product_id)
);

create index supplier_catalog_supplier_idx on public.supplier_catalog(supplier_id);
create index supplier_catalog_product_idx  on public.supplier_catalog(product_id);

-- Reuse the shared updated_at trigger function defined in 0001.
create trigger supplier_catalog_updated_at before update on public.supplier_catalog
  for each row execute function public.set_updated_at();

-- Row-level security: single-team MVP — any authenticated user has full access (same as 0001).
alter table public.supplier_catalog enable row level security;
create policy "authenticated full access" on public.supplier_catalog
  for all to authenticated using (true) with check (true);
