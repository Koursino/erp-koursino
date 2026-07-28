-- Stock core, applied ON TOP of the schema already live in Supabase.
--
-- Why this migration exists
-- -------------------------
-- The production database was built outside this repository and already holds
-- real data: a `products` catalogue (chairs, priced in MAD with VAT), a
-- `supplier_catalog`, `purchase_orders` and customer `orders`. Migrations
-- 0002/0003 were written against a greenfield schema and would collide with it
-- (`create table public.products` on an existing 24-row table). They are NOT
-- applicable as-is; this file adds the stock layer additively instead.
--
-- What it adds
-- ------------
-- * User-managed article attributes (colour, material, …) with their allowed
--   values, each value carrying the short code used inside the SKU.
-- * A structured, unique SKU on top of the EXISTING products table:
--       SUPPLIER / MODEL / <attribute codes> / SEQUENCE
--   Legacy articles keep the SKU they already have. The structured code is
--   generated only once an article is given a supplier, so the 24 existing
--   references (AR-1, BR-AV, FLORIDA-AV, …) are never rewritten behind the
--   user's back — an article adopts the new codification when it is assigned
--   one, and not before.
-- * Warehouses, per-warehouse stock levels, and an append-only movement ledger.
-- * Manual stock entry, which always demands a note.
--
-- Quantities are numeric, matching the numeric quantities already used by
-- order_lines and purchase_order_lines.

-- ---------------------------------------------------------------------------
-- Shared helper
-- ---------------------------------------------------------------------------

-- Normalises a free-text fragment into a code fragment: accents stripped,
-- uppercased, anything else collapsed into single dashes.
create or replace function public.stock_code_fragment(input text)
returns text language sql immutable as $$
  select nullif(
    btrim(
      regexp_replace(
        upper(
          translate(
            coalesce(input, ''),
            'àáâãäåçèéêëìíîïñòóôõöùúûüýÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
            'aaaaaaceeeeiiiinooooouuuuyAAAAAACEEEEIIIINOOOOOUUUUY'
          )
        ),
        '[^A-Z0-9]+', '-', 'g'
      ),
      '-'
    ),
    ''
  )
$$;

-- Suppliers need a short abbreviation to open the SKU (e.g. "LY" for LAO YAN).
alter table public.companies add column if not exists code text;
create unique index if not exists companies_code_key
  on public.companies (code) where code is not null;

-- ---------------------------------------------------------------------------
-- Article attributes — fully user-managed
-- ---------------------------------------------------------------------------
create table if not exists public.product_attributes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,           -- COLOR, MATERIAL, …
  name        text not null,                  -- label shown in the UI
  position    int  not null default 0,        -- order in forms and in the SKU
  in_sku      boolean not null default false, -- does it become a SKU segment?
  is_required boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.product_attribute_values (
  id           uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.product_attributes(id) on delete cascade,
  label        text not null,          -- "Noir"
  code         text not null,          -- "NOIR" — the fragment used in the SKU
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (attribute_id, label),
  unique (attribute_id, code),
  -- Lets product_values enforce that a value belongs to the right attribute.
  unique (id, attribute_id)
);

create index if not exists product_attribute_values_attribute_idx
  on public.product_attribute_values(attribute_id);

create or replace function public.product_attributes_normalize()
returns trigger language plpgsql as $$
begin
  new.code := public.stock_code_fragment(new.code);
  if new.code is null then
    raise exception 'Attribute code must contain at least one letter or digit';
  end if;
  return new;
end $$;

drop trigger if exists product_attributes_normalize on public.product_attributes;
create trigger product_attributes_normalize
  before insert or update on public.product_attributes
  for each row execute function public.product_attributes_normalize();

create or replace function public.product_attribute_values_normalize()
returns trigger language plpgsql as $$
begin
  new.code := coalesce(public.stock_code_fragment(new.code),
                       public.stock_code_fragment(new.label));
  if new.code is null then
    raise exception 'Attribute value code must contain at least one letter or digit';
  end if;
  return new;
end $$;

drop trigger if exists product_attribute_values_normalize on public.product_attribute_values;
create trigger product_attribute_values_normalize
  before insert or update on public.product_attribute_values
  for each row execute function public.product_attribute_values_normalize();

-- ---------------------------------------------------------------------------
-- Existing products table: codification columns, all nullable so the 24 rows
-- already in place stay valid exactly as they are.
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists supplier_id        uuid references public.companies(id) on delete restrict;
alter table public.products add column if not exists model              text;
alter table public.products add column if not exists model_code         text;
alter table public.products add column if not exists seq                int;
alter table public.products add column if not exists attributes_summary text;
alter table public.products add column if not exists barcode            text;
alter table public.products add column if not exists purchase_price     numeric(12,2);
alter table public.products add column if not exists min_stock          numeric(14,3) not null default 0;
alter table public.products add column if not exists notes              text;

-- The model is what the SKU is built from; seed it from the existing name.
update public.products set model = name where model is null;

comment on column public.products.supplier_id is
  'Set to adopt the structured SKU. While null, the article keeps its legacy code.';

-- 24 rows, 24 distinct SKUs — checked before adding this.
create unique index if not exists products_sku_key on public.products (sku);
create unique index if not exists products_supplier_seq_key
  on public.products (supplier_id, seq) where supplier_id is not null and seq is not null;
create index if not exists products_supplier_id_idx on public.products (supplier_id);

-- One value per attribute per article. The composite foreign key guarantees the
-- chosen value really belongs to the attribute it is filed under.
create table if not exists public.product_values (
  product_id   uuid not null references public.products(id)           on delete cascade,
  attribute_id uuid not null references public.product_attributes(id) on delete cascade,
  value_id     uuid not null,
  primary key (product_id, attribute_id),
  foreign key (value_id, attribute_id)
    references public.product_attribute_values(id, attribute_id) on delete restrict
);

create index if not exists product_values_attribute_idx on public.product_values(attribute_id);
create index if not exists product_values_value_idx     on public.product_values(value_id);

-- SKU segment built from the attributes flagged `in_sku`, in attribute order.
create or replace function public.product_sku_attributes(p_product_id uuid)
returns text language sql stable as $$
  select string_agg(v.code, '/' order by a.position, a.code)
    from public.product_values pv
    join public.product_attributes a       on a.id = pv.attribute_id
    join public.product_attribute_values v on v.id = pv.value_id
   where pv.product_id = p_product_id and a.in_sku
$$;

-- Human-readable variant label, e.g. "Noir · Rotin".
create or replace function public.product_attributes_summary(p_product_id uuid)
returns text language sql stable as $$
  select string_agg(v.label, ' · ' order by a.position, a.code)
    from public.product_values pv
    join public.product_attributes a       on a.id = pv.attribute_id
    join public.product_attribute_values v on v.id = pv.value_id
   where pv.product_id = p_product_id
$$;

create or replace function public.products_build_sku()
returns trigger language plpgsql as $$
declare
  v_supplier_code text;
  v_model_code    text;
  v_attributes    text;
begin
  new.attributes_summary := public.product_attributes_summary(new.id);

  -- No supplier yet: this is a legacy article, its existing code is untouched.
  if new.supplier_id is null then
    return new;
  end if;

  select coalesce(public.stock_code_fragment(c.code),
                  nullif(btrim(left(public.stock_code_fragment(c.name), 6), '-'), ''))
    into v_supplier_code
    from public.companies c
   where c.id = new.supplier_id;

  if v_supplier_code is null then
    raise exception 'The supplier needs a name or a code before its articles can be numbered';
  end if;

  v_model_code := coalesce(public.stock_code_fragment(new.model_code),
                           public.stock_code_fragment(new.model),
                           public.stock_code_fragment(new.name));
  if v_model_code is null then
    raise exception 'The article needs a model or a name to build its code';
  end if;
  new.model_code := v_model_code;

  if new.seq is null or new.seq <= 0 then
    -- Serialise numbering per supplier so two concurrent inserts cannot collide.
    perform pg_advisory_xact_lock(hashtext(new.supplier_id::text));
    select coalesce(max(seq), 0) + 1 into new.seq
      from public.products
     where supplier_id = new.supplier_id;
  end if;

  -- On INSERT the attribute values do not exist yet; the trigger on
  -- product_values touches the row again once they do.
  v_attributes := coalesce(public.product_sku_attributes(new.id), 'NA');

  new.sku := v_supplier_code || '/' || v_model_code || '/' || v_attributes
             || '/' || lpad(new.seq::text, 4, '0');
  return new;
end $$;

drop trigger if exists products_build_sku on public.products;
create trigger products_build_sku before insert or update on public.products
  for each row execute function public.products_build_sku();

-- Touching a product re-derives its SKU and summary through the trigger above.
create or replace function public.refresh_product_sku(p_product_id uuid)
returns void language sql as $$
  update public.products set updated_at = now() where id = p_product_id;
$$;

create or replace function public.product_values_refresh()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_product_sku(old.product_id);
    return old;
  end if;
  perform public.refresh_product_sku(new.product_id);
  return new;
end $$;

drop trigger if exists product_values_refresh on public.product_values;
create trigger product_values_refresh
  after insert or update or delete on public.product_values
  for each row execute function public.product_values_refresh();

-- Renaming a value code, reordering attributes or toggling `in_sku` rewrites
-- every affected SKU. Cheap at catalogue scale, and always correct.
create or replace function public.refresh_all_product_skus()
returns trigger language plpgsql as $$
begin
  update public.products set updated_at = now() where supplier_id is not null;
  return null;
end $$;

drop trigger if exists product_attributes_refresh_skus on public.product_attributes;
create trigger product_attributes_refresh_skus
  after update or delete on public.product_attributes
  for each statement execute function public.refresh_all_product_skus();

drop trigger if exists product_attribute_values_refresh_skus on public.product_attribute_values;
create trigger product_attribute_values_refresh_skus
  after update on public.product_attribute_values
  for each statement execute function public.refresh_all_product_skus();

-- ---------------------------------------------------------------------------
-- Warehouses
-- ---------------------------------------------------------------------------
create table if not exists public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique, -- short handle, e.g. MAIN, DEPOT-2
  name       text not null,
  address    text,
  city       text,
  country    text,
  is_default boolean not null default false,
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.warehouses_normalize()
returns trigger language plpgsql as $$
begin
  new.code := public.stock_code_fragment(new.code);
  if new.code is null then
    raise exception 'Warehouse code must contain at least one letter or digit';
  end if;
  if new.is_default then
    update public.warehouses set is_default = false
     where is_default and id is distinct from new.id;
  end if;
  return new;
end $$;

drop trigger if exists warehouses_normalize on public.warehouses;
create trigger warehouses_normalize before insert or update on public.warehouses
  for each row execute function public.warehouses_normalize();

-- ---------------------------------------------------------------------------
-- Stock levels — cache of the ledger, one row per (article, warehouse)
-- ---------------------------------------------------------------------------
create table if not exists public.stock_levels (
  product_id   uuid not null references public.products(id)   on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  quantity     numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at   timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);

create index if not exists stock_levels_warehouse_id_idx on public.stock_levels(warehouse_id);

-- ---------------------------------------------------------------------------
-- Stock movements — append-only ledger, the single source of truth
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id)   on delete restrict,
  warehouse_id      uuid not null references public.warehouses(id) on delete restrict,
  quantity          numeric(14,3) not null check (quantity <> 0), -- signed
  reason            text not null check (reason in
                      ('reception', 'delivery', 'transfer_in', 'transfer_out',
                       'adjustment', 'return')),
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  order_id          uuid references public.orders(id)          on delete set null,
  note              text,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid()
);

create index if not exists stock_movements_product_idx   on public.stock_movements(product_id);
create index if not exists stock_movements_warehouse_idx on public.stock_movements(warehouse_id);
create index if not exists stock_movements_created_idx   on public.stock_movements(created_at desc);

-- The ledger is history: corrections are new movements, never edits.
create or replace function public.stock_movements_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Stock movements are an append-only ledger — post a correcting movement instead';
end $$;

drop trigger if exists stock_movements_append_only on public.stock_movements;
create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function public.stock_movements_append_only();

-- Every movement updates the cached level. The `quantity >= 0` check on
-- stock_levels is the last-resort guard against stock going negative.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql as $$
begin
  insert into public.stock_levels (product_id, warehouse_id, quantity)
  values (new.product_id, new.warehouse_id, new.quantity)
  on conflict (product_id, warehouse_id) do update
    set quantity   = public.stock_levels.quantity + excluded.quantity,
        updated_at = now();
  return new;
end $$;

drop trigger if exists apply_stock_movement on public.stock_movements;
create trigger apply_stock_movement after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ---------------------------------------------------------------------------
-- Manual entry — the way to record what is physically on the shelves today.
-- p_quantity is a signed delta. A note is mandatory: a manual movement has no
-- source document, so the reason must be recorded on the movement itself.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_quantity     numeric,
  p_note         text
) returns public.stock_movements language plpgsql as $$
declare
  v_current  numeric;
  v_movement public.stock_movements;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Adjustment quantity cannot be zero';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'A manual stock entry requires a note explaining the reason';
  end if;

  select quantity into v_current
    from public.stock_levels
   where product_id = p_product_id and warehouse_id = p_warehouse_id
     for update;

  if coalesce(v_current, 0) + p_quantity < 0 then
    raise exception 'Adjustment would make stock negative: % available, % requested',
      coalesce(v_current, 0), p_quantity;
  end if;

  insert into public.stock_movements (product_id, warehouse_id, quantity, reason, note)
  values (p_product_id, p_warehouse_id, p_quantity, 'adjustment', btrim(p_note))
  returning * into v_movement;

  return v_movement;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance (public.set_updated_at already exists from 0001)
-- ---------------------------------------------------------------------------
drop trigger if exists warehouses_updated_at on public.warehouses;
create trigger warehouses_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();

drop trigger if exists product_attributes_updated_at on public.product_attributes;
create trigger product_attributes_updated_at before update on public.product_attributes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: same single-team policy as the rest of the schema.
-- ---------------------------------------------------------------------------
alter table public.product_attributes       enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_values           enable row level security;
alter table public.warehouses                enable row level security;
alter table public.stock_levels              enable row level security;
alter table public.stock_movements           enable row level security;

drop policy if exists "authenticated full access" on public.product_attributes;
create policy "authenticated full access" on public.product_attributes
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.product_attribute_values;
create policy "authenticated full access" on public.product_attribute_values
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.product_values;
create policy "authenticated full access" on public.product_values
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.warehouses;
create policy "authenticated full access" on public.warehouses
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.stock_levels;
create policy "authenticated full access" on public.stock_levels
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access" on public.stock_movements;
create policy "authenticated full access" on public.stock_movements
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Seed: one warehouse and the two default attributes. All of it is editable.
-- Colour feeds the SKU (as specified); material is descriptive by default.
-- ---------------------------------------------------------------------------
insert into public.warehouses (code, name, is_default)
select 'MAIN', 'Entrepôt principal', true
 where not exists (select 1 from public.warehouses);

insert into public.product_attributes (code, name, position, in_sku, is_required)
select v.code, v.name, v.position, v.in_sku, false
  from (values
    ('COLOR',    'Couleur', 1, true),
    ('MATERIAL', 'Matière', 2, false)
  ) as v(code, name, position, in_sku)
 where not exists (select 1 from public.product_attributes a where a.code = v.code);

insert into public.product_attribute_values (attribute_id, label, code, position)
select a.id, v.label, v.code, v.position
  from public.product_attributes a
  join (values
    ('COLOR',    'Noir',      'NOIR', 1),
    ('COLOR',    'Blanc',     'BLC',  2),
    ('COLOR',    'Gris',      'GRIS', 3),
    ('COLOR',    'Beige',     'BEIG', 4),
    ('COLOR',    'Bleu',      'BLEU', 5),
    ('COLOR',    'Vert',      'VERT', 6),
    ('MATERIAL', 'Rotin',     'ROT',  1),
    ('MATERIAL', 'Plastique', 'PLA',  2),
    ('MATERIAL', 'Métal',     'MET',  3),
    ('MATERIAL', 'Bois',      'BOIS', 4),
    ('MATERIAL', 'Tissu',     'TIS',  5),
    ('MATERIAL', 'Aluminium', 'ALU',  6)
  ) as v(attribute_code, label, code, position) on v.attribute_code = a.code
 where not exists (
   select 1 from public.product_attribute_values x
    where x.attribute_id = a.id and x.label = v.label
 );
