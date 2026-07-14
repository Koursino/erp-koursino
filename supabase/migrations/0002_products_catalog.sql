-- Product catalog schema (Catalogue Produits) — foundation of the future Sales module.
--
-- Moroccan context: prices in MAD (Dhs), sold HT with an auto-computed TTC, default VAT 20%.
--
-- Forward design for the future Sales/Orders module:
--   * order_lines will reference public.products(id) via product_id (foreign key).
--   * IMPORTANT: an order line must SNAPSHOT unit_price_ht / vat_rate / unit_price_ttc
--     onto itself at sale time (do NOT join live catalog prices), so historical orders,
--     delivery notes (BL) and invoices keep the price actually charged even after the
--     catalog price changes.
--   * Products are deactivated (is_active = false), not deleted, once referenced by an
--     order, to preserve those references.

create extension if not exists "pgcrypto"; -- gen_random_uuid (already enabled by 0001; harmless)

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null,                              -- product reference (unique, see index below)
  name           text not null,                             -- désignation
  description    text,
  category       text,                                      -- product family; managed as a fixed list in the app (PRODUCT_CATEGORIES)
  photo_url      text,                                      -- public URL in the 'product-photos' Storage bucket
  unit_price_ht  numeric(12,2) not null check (unit_price_ht >= 0),
  vat_rate       numeric(5,2)  not null default 20 check (vat_rate >= 0 and vat_rate <= 100), -- % TVA
  -- Backend is the single source of truth for TTC. STORED generated column:
  -- it is computed by Postgres and CANNOT be inserted/updated by hand.
  unit_price_ttc numeric(12,2) generated always as (round(unit_price_ht * (1 + vat_rate / 100), 2)) stored,
  unit           text not null default 'pièce',             -- unité de vente (pièce, kg, m, lot…)
  currency       text not null default 'MAD',               -- kept for consistency with deals + future multi-currency
  is_active      boolean not null default true,             -- deactivate instead of deleting
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Unique SKU: a duplicate raises Postgres error 23505 (mapped to a clear French message in the app).
create unique index products_sku_key      on public.products (sku);
create index        products_category_idx  on public.products (category);
create index        products_is_active_idx on public.products (is_active);

-- Reuse the shared updated_at trigger function defined in 0001.
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Row-level security: single-team MVP — any authenticated user has full access (same as 0001).
alter table public.products enable row level security;
create policy "authenticated full access" on public.products
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage: public bucket for product photos.
-- Public read (so photo_url renders directly), authenticated write.
-- If your Supabase SQL editor refuses to create policies on storage.objects,
-- create this bucket and the four policies from the Storage UI instead.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

create policy "product-photos public read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-photos');

create policy "product-photos authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-photos');

create policy "product-photos authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-photos')
  with check (bucket_id = 'product-photos');

create policy "product-photos authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-photos');
