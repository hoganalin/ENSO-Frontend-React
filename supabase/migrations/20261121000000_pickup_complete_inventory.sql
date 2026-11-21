-- 20261121000000_pickup_complete_inventory.sql
-- 親送/到店自取模式：允許管理員把「已付款」訂單直接標記「已完成（交貨）」，
-- 不需經過「出貨＋物流單號」。直接從 paid 完成時，在此原子扣庫存並寫 inventory_logs，
-- 避免跳過出貨步驟造成庫存沒扣。（已出貨→完成者庫存已於出貨時扣，不重複扣。）
begin;
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
    if ord.status not in ('paid','shipped') then raise exception 'Only paid or shipped orders can complete'; end if;
    -- 親送：直接從已付款完成 → 在此扣庫存（出貨路徑已扣者不會走到這裡）
    if ord.status='paid' then
      if not exists(select 1 from public.order_items where order_id=p_order) then raise exception 'Order items missing'; end if;
      for item in select product_id,sum(qty)::integer qty from public.order_items where order_id=p_order group by product_id order by product_id loop
        select * into product from public.products where id=item.product_id for update;
        if not found or product.inventory < item.qty or item.qty<1 then raise exception 'Insufficient inventory'; end if;
        update public.products set inventory=inventory-item.qty where id=product.id;
        insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id)
          values(product.id,product.title,'subtract',item.qty,product.inventory,product.inventory-item.qty,'交貨完成 '||ord.order_no,p_actor);
      end loop;
    end if;
    update public.orders set status='completed',completed_at=now() where id=p_order;
  end if;
  insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,p_action,p_order,jsonb_build_object('previous_status',ord.status,'tracking_number',p_tracking));
  select * into ord from public.orders where id=p_order;
  return to_jsonb(ord);
end;
$$;
revoke all on function public.admin_order_action(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_order_action(uuid,uuid,text,jsonb,text) to service_role;
commit;
