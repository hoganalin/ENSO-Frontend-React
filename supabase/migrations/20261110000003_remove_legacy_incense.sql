-- 清除舊 ENSO 線香品項（王后美芙改版後不再販售）：老山檀香 / 芽莊沈香 / 和敬香道禮盒
-- 防呆：被訂單(order_items)或贈品(order_gifts)引用者保留下架，維持歷史外鍵完整；
--       order_items 已存 title 快照，歷史訂單顯示不受影響。inventory_logs 為 on delete cascade。

-- 1) 一律下架（不在前台顯示）
update public.products set is_enabled = false
where title like '老山檀香%' or title like '芽莊沈香%' or title like '%香道禮盒%';

-- 2) 移除綁定舊線香的 demo 優惠券（未被訂單贈品引用時才刪）
delete from public.promotions pr
where pr.code = 'INCENSE15'
  and not exists (select 1 from public.order_gifts og where og.promotion_id = pr.id);

-- 3) 刪除未被訂單/贈品引用的舊線香品項
delete from public.products p
where (p.title like '老山檀香%' or p.title like '芽莊沈香%' or p.title like '%香道禮盒%')
  and not exists (select 1 from public.order_items oi where oi.product_id = p.id)
  and not exists (select 1 from public.order_gifts og where og.product_id = p.id);
