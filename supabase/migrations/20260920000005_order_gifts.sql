begin;
create table if not exists public.order_gifts(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 promotion_id uuid references public.promotions(id),title text not null,qty integer not null check(qty between 1 and 999),
 product_id uuid references public.products(id),created_at timestamptz not null default now(),unique(order_id,promotion_id)
);
alter table public.order_gifts enable row level security;
grant select on public.order_gifts to authenticated;
grant all on public.order_gifts to service_role;
drop policy if exists order_gifts_read on public.order_gifts;
create policy order_gifts_read on public.order_gifts for select using(public.is_staff() or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
create or replace function public.snapshot_order_gifts() returns trigger language plpgsql security definer set search_path=public as $$
declare applied jsonb; promo public.promotions%rowtype; sku uuid; amount integer; product public.products%rowtype;
begin
 for applied in select value from jsonb_array_elements(coalesce(new.applied_promos,'[]')) loop
  if nullif(trim(applied->>'gift'),'') is null then continue; end if;
  select * into promo from public.promotions where id=(applied->>'id')::uuid for share;
  if not found or not promo.is_active or (promo.starts_at is not null and promo.starts_at>now()) or (promo.ends_at is not null and promo.ends_at<=now()) then raise exception 'Gift promotion changed'; end if;
  if promo.effect->>'gift' is distinct from applied->>'gift' then raise exception 'Gift changed'; end if;
  amount:=coalesce((promo.effect->>'gift_qty')::integer,1);
  sku:=nullif(promo.effect->>'gift_product_id','')::uuid;
  if amount not between 1 and 999 then raise exception 'Invalid gift quantity'; end if;
  if sku is not null then
   select * into product from public.products where id=sku for share;
   if not found or not product.is_enabled or product.inventory<amount then raise exception 'Gift out of stock'; end if;
  end if;
  insert into public.order_gifts(order_id,promotion_id,title,qty,product_id) values(new.id,promo.id,applied->>'gift',amount,sku);
 end loop;
 return new;
end $$;
drop trigger if exists snapshot_order_gifts on public.orders;
create trigger snapshot_order_gifts after insert on public.orders for each row execute function public.snapshot_order_gifts();
create or replace function public.admin_order_action(p_actor uuid,p_order uuid,p_action text,p_recipient jsonb default null,p_tracking text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; ord public.orders%rowtype; item record; product public.products%rowtype;
begin
  select role::text into actor from public.profiles where id=p_actor for share;
  if actor is null then raise exception 'Unauthorized'; end if;
  if (p_action in ('update_recipient','cancel') and actor not in ('support','admin'))
    or (p_action in ('ship','complete') and actor not in ('warehouse','admin'))
    or p_action not in ('update_recipient','cancel','ship','complete') or p_action is null then
    raise exception 'Forbidden action';
  end if;
  select * into ord from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action='update_recipient' then
    if ord.status not in ('pending','paid') then raise exception 'Recipient is locked after shipping'; end if;
    if jsonb_typeof(p_recipient) is distinct from 'object' or coalesce(length(trim(p_recipient->>'name')),0)<1
      or coalesce(length(trim(p_recipient->>'address')),0)<6
      or coalesce(p_recipient->>'tel','') !~ '^(09[0-9]{8}|\+8869[0-9]{8})$'
      or coalesce(p_recipient->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid recipient'; end if;
    update public.orders set recipient=p_recipient where id=p_order;
  elsif p_action='cancel' then
    if ord.status <> 'pending' then raise exception 'Only unpaid orders can be cancelled'; end if;
    update public.orders set status='cancelled' where id=p_order;
  elsif p_action='ship' then
    if ord.status='shipped' and ord.tracking_number=p_tracking then return to_jsonb(ord); end if;
    if ord.status <> 'paid' then raise exception 'Only paid orders can ship'; end if;
    if coalesce(length(trim(p_tracking)),0) not between 1 and 100 then raise exception 'Tracking number required'; end if;
    if not exists(select 1 from public.order_items where order_id=p_order) then raise exception 'Order items missing'; end if;
    for item in select product_id,sum(qty)::integer qty from public.order_items where order_id=p_order group by product_id order by product_id loop
      select * into product from public.products where id=item.product_id for update;
      if not found or product.inventory < item.qty or item.qty<1 then raise exception 'Insufficient inventory'; end if;
      update public.products set inventory=inventory-item.qty where id=product.id;
      insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id)
        values(product.id,product.title,'subtract',item.qty,product.inventory,product.inventory-item.qty,'出貨 '||ord.order_no,p_actor);
    end loop;
    for item in select product_id,sum(qty)::integer qty from public.order_gifts where order_id=p_order and product_id is not null group by product_id order by product_id loop
      select * into product from public.products where id=item.product_id for update;
      if not found or product.inventory<item.qty then raise exception 'Insufficient gift inventory'; end if;
      update public.products set inventory=inventory-item.qty where id=product.id;
      insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id)
        values(product.id,product.title,'subtract',item.qty,product.inventory,product.inventory-item.qty,'贈品出貨 '||ord.order_no,p_actor);
    end loop;
    update public.orders set status='shipped',tracking_number=trim(p_tracking),shipped_at=now() where id=p_order;
  elsif p_action='complete' then
    if ord.status='completed' then return to_jsonb(ord); end if;
    if ord.status <> 'shipped' then raise exception 'Only shipped orders can complete'; end if;
    update public.orders set status='completed',completed_at=now() where id=p_order;
  end if;
  insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,p_action,p_order,jsonb_build_object('previous_status',ord.status,'tracking_number',p_tracking));
  select * into ord from public.orders where id=p_order;
  return to_jsonb(ord);
end;
$$;
revoke all on function public.admin_order_action(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_order_action(uuid,uuid,text,jsonb,text) to service_role;

create or replace function public.confirm_order_picking(p_order uuid) returns public.order_picking
 language plpgsql security definer set search_path=public as $$
 declare ord public.orders%rowtype; picked public.order_picking%rowtype; lines jsonb;
 begin
  if auth.uid() is null or coalesce(public.current_role()::text,'') not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
  select * into ord from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select * into picked from public.order_picking where order_id=p_order;
  if found then return picked; end if;
  if ord.status<>'paid' then raise exception 'Only paid orders may be picked'; end if;
  select jsonb_agg(jsonb_build_object('product_id',product_id,'title',title,'qty',qty) order by id)
   into lines from public.order_items where order_id=p_order;
  if lines is null then raise exception 'Order has no items'; end if;
  lines:=lines || coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'title',title,'qty',qty,'gift',true) order by id) from public.order_gifts where order_id=p_order),'[]'::jsonb);
  insert into public.order_picking(order_id,actor_id,items) values(p_order,auth.uid(),lines) returning * into picked;
  insert into public.operation_logs(actor_id,action,order_id,details) values(auth.uid(),'picking_confirmed',p_order,jsonb_build_object('items',lines));
  return picked;
 end $$;
revoke all on function public.confirm_order_picking(uuid) from public,anon;
grant execute on function public.confirm_order_picking(uuid) to authenticated;
commit;

