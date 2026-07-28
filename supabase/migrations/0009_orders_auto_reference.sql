-- Customer orders get their KRS-YYYY-NNNNN reference automatically, like
-- purchase orders already do with BC-. Before this, next_order_reference()
-- had to be called by the application.
create or replace function public.orders_set_reference()
returns trigger language plpgsql as $$
begin
  if new.reference is null then
    new.reference := public.next_order_reference();
  end if;
  return new;
end $$;

drop trigger if exists orders_set_reference on public.orders;
create trigger orders_set_reference before insert on public.orders
  for each row execute function public.orders_set_reference();
