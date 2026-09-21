begin;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;
create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
  action text not null, order_id uuid references public.orders(id), details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.operation_logs enable row level security;
grant select on public.operation_logs to authenticated;
grant all on public.operation_logs to service_role;
drop policy if exists operation_logs_read on public.operation_logs;
create policy operation_logs_read on public.operation_logs for select using(public.current_role() in ('finance','admin'));

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
-- All order changes now go through the audited, role-checked server operation.
revoke update,delete on public.orders from anon,authenticated;
revoke update,delete on public.order_items from anon,authenticated;
commit;
