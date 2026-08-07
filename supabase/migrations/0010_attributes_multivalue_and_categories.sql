-- Attributes that hold more than one value, and categories managed like any
-- other attribute.
--
-- Why this migration exists
-- -------------------------
-- Two gaps reported in review:
--
--   * "Sur la section attributs, je veux deux types de couleurs : couleur
--     unique et bicolore." Until now `product_values` was keyed on
--     (product_id, attribute_id), so an article could carry exactly ONE colour.
--     An attribute now declares how many values it accepts: COLOR moves to 2,
--     so one value = single colour, two values = bicolour. The list of colours
--     stays in one place instead of being duplicated into a second attribute.
--
--   * "Je souhaite que les catégories (chaise, table, pieds…) soient
--     ajustables au niveau de la rubrique attributs." The category was a
--     hard-coded TypeScript list. It becomes the CATEGORY attribute, editable
--     on /stock/attributes like the others, while `products.category` stays as
--     a database-maintained mirror so every existing filter and report keeps
--     working untouched.
--
-- Additive: no table is created or dropped, and the 25 live articles keep
-- their SKU, their category and their history.

-- ---------------------------------------------------------------------------
-- How many values an attribute accepts per article
-- ---------------------------------------------------------------------------
alter table public.product_attributes
  add column if not exists max_values int not null default 1;

alter table public.product_attributes
  drop constraint if exists product_attributes_max_values_check;
alter table public.product_attributes
  add constraint product_attributes_max_values_check check (max_values between 1 and 5);

comment on column public.product_attributes.max_values is
  'Values an article may carry for this attribute. COLOR = 2: one value is a single colour, two is bicolour.';

update public.product_attributes set max_values = 2 where code = 'COLOR';

-- `attributes_summary` is the variant label shown next to the article name
-- ("Chaise Aura · Noir/Blanc") and copied onto order lines. A classifying
-- attribute such as the category belongs to the article, not to the variant,
-- so it must stay out of that label.
alter table public.product_attributes
  add column if not exists in_summary boolean not null default true;

comment on column public.product_attributes.in_summary is
  'Does this attribute appear in the variant label? False for classifying attributes such as CATEGORY.';

-- ---------------------------------------------------------------------------
-- product_values: several values per attribute
-- ---------------------------------------------------------------------------
-- The primary key carried the "one value per attribute" rule. The composite
-- foreign key (value_id, attribute_id) is untouched, so a value still cannot
-- be filed under an attribute it does not belong to.
do $$
declare
  v_pkey text;
begin
  select conname into v_pkey
    from pg_constraint
   where conrelid = 'public.product_values'::regclass and contype = 'p';

  if v_pkey = 'product_values_pkey_multi' then
    return;
  end if;

  if v_pkey is not null then
    execute format('alter table public.product_values drop constraint %I', v_pkey);
  end if;

  alter table public.product_values
    add constraint product_values_pkey_multi
    primary key (product_id, attribute_id, value_id);
end $$;

-- `max_values` is enforced here rather than by a constraint: the rule spans
-- several rows of product_values and lives on another table.
create or replace function public.product_values_enforce_max()
returns trigger language plpgsql as $$
declare
  v_max   int;
  v_count int;
  v_name  text;
begin
  select max_values, name into v_max, v_name
    from public.product_attributes where id = new.attribute_id;

  select count(*) into v_count
    from public.product_values
   where product_id = new.product_id and attribute_id = new.attribute_id;

  if v_count > coalesce(v_max, 1) then
    raise exception '% accepte au maximum % valeur(s) par article', coalesce(v_name, 'Cet attribut'), coalesce(v_max, 1);
  end if;
  return null;
end $$;

-- AFTER, so the row being inserted is already counted.
drop trigger if exists product_values_enforce_max on public.product_values;
create trigger product_values_enforce_max
  after insert or update on public.product_values
  for each row execute function public.product_values_enforce_max();

-- ---------------------------------------------------------------------------
-- SKU and summary: aggregate twice — within an attribute, then across them
-- ---------------------------------------------------------------------------
-- A bicolour article reads NOIR-BLC inside its own segment, so the '/'
-- separator keeps meaning "next attribute": LY/CHAISE-AURA/NOIR-BLC/ROT/0001.
create or replace function public.product_sku_attributes(p_product_id uuid)
returns text language sql stable as $$
  select string_agg(seg.codes, '/' order by seg.position, seg.code)
    from (
      select a.position, a.code,
             string_agg(v.code, '-' order by v.position, v.code) as codes
        from public.product_values pv
        join public.product_attributes a       on a.id = pv.attribute_id
        join public.product_attribute_values v on v.id = pv.value_id
       where pv.product_id = p_product_id and a.in_sku
       group by a.id, a.position, a.code
    ) seg
$$;

-- Human-readable variant label, e.g. "Noir/Blanc · Rotin".
create or replace function public.product_attributes_summary(p_product_id uuid)
returns text language sql stable as $$
  select string_agg(seg.labels, ' · ' order by seg.position, seg.code)
    from (
      select a.position, a.code,
             string_agg(v.label, '/' order by v.position, v.label) as labels
        from public.product_values pv
        join public.product_attributes a       on a.id = pv.attribute_id
        join public.product_attribute_values v on v.id = pv.value_id
       where pv.product_id = p_product_id and a.in_summary
       group by a.id, a.position, a.code
    ) seg
$$;

-- ---------------------------------------------------------------------------
-- Category as an attribute, mirrored onto products.category
-- ---------------------------------------------------------------------------
insert into public.product_attributes (code, name, position, in_sku, in_summary, is_required, max_values)
select 'CATEGORY', 'Catégorie', 0, false, false, false, 1
 where not exists (select 1 from public.product_attributes a where a.code = 'CATEGORY');

-- Idempotent when the attribute was created by an earlier run of this file.
update public.product_attributes set in_summary = false where code = 'CATEGORY';

-- Seed the list from the categories already in use, so nothing has to be
-- retyped and existing articles map onto an existing value.
insert into public.product_attribute_values (attribute_id, label, code, position)
select a.id, c.category, public.stock_code_fragment(c.category), c.position
  from public.product_attributes a
  join (
    select category,
           row_number() over (order by category) as position
      from (select distinct btrim(category) as category
              from public.products
             where category is not null and btrim(category) <> '') d
  ) c on true
 where a.code = 'CATEGORY'
   and not exists (
     select 1 from public.product_attribute_values x
      where x.attribute_id = a.id and x.label = c.category
   );

-- Chosen category of an article, or null when none is assigned.
create or replace function public.product_category_label(p_product_id uuid)
returns text language sql stable as $$
  select v.label
    from public.product_values pv
    join public.product_attributes a       on a.id = pv.attribute_id and a.code = 'CATEGORY'
    join public.product_attribute_values v on v.id = pv.value_id
   where pv.product_id = p_product_id
   limit 1
$$;

-- Same body as 0006 plus the category mirror. Kept before the early return so
-- legacy articles (supplier_id null) get their category and summary too.
create or replace function public.products_build_sku()
returns trigger language plpgsql as $$
declare
  v_supplier_code text;
  v_model_code    text;
  v_attributes    text;
  v_category      text;
begin
  new.attributes_summary := public.product_attributes_summary(new.id);

  -- The attribute wins when one is assigned; otherwise the column keeps the
  -- value it already had, so an article without a CATEGORY value is never
  -- blanked behind the user's back.
  v_category := public.product_category_label(new.id);
  if v_category is not null then
    new.category := v_category;
  end if;

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

-- 0006 refreshed only articles carrying a supplier, because only those have a
-- generated SKU. Now that renaming a category value has to reach every mirror,
-- the refresh covers the whole catalogue — a few dozen rows.
create or replace function public.refresh_all_product_skus()
returns trigger language plpgsql as $$
begin
  update public.products set updated_at = now();
  return null;
end $$;

-- Assigning the CATEGORY value of every article that already has a category,
-- so the attribute and the mirror agree from day one.
insert into public.product_values (product_id, attribute_id, value_id)
select p.id, a.id, v.id
  from public.products p
  join public.product_attributes a       on a.code = 'CATEGORY'
  join public.product_attribute_values v on v.attribute_id = a.id
                                        and v.label = btrim(p.category)
 where p.category is not null and btrim(p.category) <> ''
   and not exists (
     select 1 from public.product_values pv
      where pv.product_id = p.id and pv.attribute_id = a.id
   );
