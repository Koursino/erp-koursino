-- Purchasing module (Achats) — Phase B: purchase order document.
-- A single status-driven document covers both flows (direct catalog buy and
-- negotiated RFQ). See docs/adr-002-purchasing-module.md.
--
-- Reuses public.companies (0001), public.products (0002), public.set_updated_at() (0001).

-- Auto-incrementing reference: BC-YYYY-0001
create sequence if not exists public.purchase_order_ref_seq;

create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  reference     text unique,
  supplier_id   uuid references public.companies(id) on delete set null,
  status        text not null default 'draft' check (status in (
                  'draft',          -- brouillon
                  'rfq_sent',       -- demande de devis envoyée
                  'quote_received', -- devis reçu
                  'confirmed',      -- devis accepté / achat validé (bon de commande généré)
                  'ordered',        -- bon de commande envoyé au fournisseur
                  'received',       -- marchandise réceptionnée (→ stock, phase C)
                  'invoiced',       -- facture reçue (→ paiements, phase C)
                  'paid',           -- payé
                  'cancelled')),    -- annulé
  currency      text not null default 'MAD',
  order_date    date default current_date,
  expected_date date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index purchase_orders_status_idx   on public.purchase_orders(status);

-- Assign a human-readable reference on insert if none was provided.
create or replace function public.set_purchase_order_reference()
returns trigger language plpgsql as $$
begin
  if new.reference is null then
    new.reference := 'BC-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(nextval('public.purchase_order_ref_seq')::text, 4, '0');
  end if;
  return new;
end $$;

create trigger purchase_orders_set_reference before insert on public.purchase_orders
  for each row execute function public.set_purchase_order_reference();

create trigger purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Order lines. Product name and unit price are SNAPSHOT here at add time, so a
-- purchase order keeps the price actually agreed even if the catalog changes later.
-- ---------------------------------------------------------------------------
create table public.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  description       text not null default '',   -- snapshot of the product name at add time
  quantity          numeric(12,2) not null default 1 check (quantity > 0),
  unit_price        numeric(12,2) not null default 0 check (unit_price >= 0), -- snapshot purchase price
  position          int not null default 0,
  created_at        timestamptz not null default now()
);

create index purchase_order_lines_po_idx on public.purchase_order_lines(purchase_order_id);

-- ---------------------------------------------------------------------------
-- Row-level security: single-team MVP — any authenticated user has full access.
-- ---------------------------------------------------------------------------
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_lines enable row level security;

create policy "authenticated full access" on public.purchase_orders
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.purchase_order_lines
  for all to authenticated using (true) with check (true);
