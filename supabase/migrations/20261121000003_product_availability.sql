-- 20261121000003_product_availability.sql
-- 前台「可售量」：可售 = 實體在庫 − 已被「已付款 / 近 30 分鐘內未付款」訂單佔用的數量（與下單預留一致）。
-- SECURITY DEFINER：顧客不能直接讀訂單，但可透過本函式取得「可售數字」（不洩漏任何訂單明細）。
create or replace function public.product_availability(p_ids uuid[])
returns table(product_id uuid, available bigint)
language sql security definer set search_path = public stable as $$
  select p.id,
    greatest(p.inventory::bigint - coalesce((
      select sum(oi.qty) from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.product_id = p.id
        and (o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - interval '30 minutes'))
    ), 0), 0) as available
  from public.products p
  where p.id = any(p_ids);
$$;
revoke all on function public.product_availability(uuid[]) from public;
grant execute on function public.product_availability(uuid[]) to anon, authenticated;
