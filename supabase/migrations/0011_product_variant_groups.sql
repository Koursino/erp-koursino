-- Colour variants of one commercial reference.
--
-- Why this migration exists
-- -------------------------
-- "J'aimerais être en mesure de dire pour telle référence, voici les couleurs
-- qu'on commercialise, et que ceci soit impacté au niveau du stock."
--
-- A colour is a stockable article: CHAISE AURA in black and in white are two
-- SKUs, two stock levels, two order lines. That is what the SKU built by 0006
-- already assumes (SUPPLIER/MODEL/COLOUR/SEQ), and it keeps stock counted per
-- (article, warehouse) — the ledger, the cached levels and the five stock RPCs
-- are untouched.
--
-- What was missing is the link back: knowing that those two articles are the
-- same reference. `variant_group_id` is that link. There is deliberately NO
-- parent row: every variant stays an ordinary article, sellable and
-- receivable, so no screen has to learn about a new kind of product.
alter table public.products add column if not exists variant_group_id uuid;

comment on column public.products.variant_group_id is
  'Articles sharing this id are colour variants of one commercial reference. No parent row exists.';

-- Existing articles are each their own reference until the user groups them.
update public.products set variant_group_id = gen_random_uuid() where variant_group_id is null;

create index if not exists products_variant_group_idx on public.products (variant_group_id);

-- A new article is its own reference unless it is created as a variant of one.
create or replace function public.products_set_variant_group()
returns trigger language plpgsql as $$
begin
  if new.variant_group_id is null then
    new.variant_group_id := gen_random_uuid();
  end if;
  return new;
end $$;

drop trigger if exists products_set_variant_group on public.products;
create trigger products_set_variant_group before insert on public.products
  for each row execute function public.products_set_variant_group();
