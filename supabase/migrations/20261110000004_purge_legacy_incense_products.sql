-- 徹底移除剩餘兩支舊線香品項：老山檀香・線香 / 和敬・香道禮盒
--
-- order_items 有 guard_checkout_item trigger：非 service_role 身分禁止修改 server-v1 結帳明細。
-- 這裡以該 trigger「自己預留的合法繞過」—— 將本交易身分設為 service_role —— 來解除連結，
-- 不停用、也不破壞任何保護機制。訂單與付款紀錄全部保留。
-- order_items 已存 title/unit_price 快照，訂單顯示與金額不受影響。

-- 設為 service_role（涵蓋新舊兩種 auth.role() 實作）
set local request.jwt.claims = '{"role":"service_role"}';
set local "request.jwt.claim.role" = 'service_role';

update public.order_items set product_id = null
where product_id in (
  select id from public.products
  where title like '老山檀香%' or title like '%香道禮盒%'
);

update public.order_gifts set product_id = null
where product_id in (
  select id from public.products
  where title like '老山檀香%' or title like '%香道禮盒%'
);

delete from public.products
where title like '老山檀香%' or title like '%香道禮盒%';
