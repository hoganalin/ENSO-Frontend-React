-- Preserve the established gross subtotal contract for historical and new orders.
-- total = subtotal - discount + shipping_fee. No data rewrite or checkout RPC replacement.
begin;
comment on column public.orders.subtotal is '折扣前商品總額；total = subtotal - discount + shipping_fee';
commit;
