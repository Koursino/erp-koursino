-- Fix: apply_stock_movement used INSERT ... ON CONFLICT DO UPDATE, but
-- PostgreSQL evaluates CHECK constraints on the proposed row BEFORE resolving
-- the conflict. Any negative movement (delivery, transfer out, downward
-- adjustment) therefore tripped stock_levels_quantity_check even when the
-- cached level was sufficient. Update-first avoids putting a negative tuple
-- through the check; the freshly inserted row only ever carries a positive
-- quantity, and a negative movement against a missing level is correctly
-- rejected by the constraint.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql as $$
begin
  update public.stock_levels
     set quantity   = quantity + new.quantity,
         updated_at = now()
   where product_id = new.product_id and warehouse_id = new.warehouse_id;

  if not found then
    insert into public.stock_levels (product_id, warehouse_id, quantity)
    values (new.product_id, new.warehouse_id, new.quantity);
  end if;

  return new;
end $$;
