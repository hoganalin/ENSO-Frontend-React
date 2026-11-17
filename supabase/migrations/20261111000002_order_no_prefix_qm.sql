-- 訂單編號前綴 ENSO- → QM-（只影響新訂單；既有訂單的 order_no 保持不變）
alter table public.orders
  alter column order_no set default ('QM-' || upper(substr(md5(gen_random_uuid()::text),1,8)));
