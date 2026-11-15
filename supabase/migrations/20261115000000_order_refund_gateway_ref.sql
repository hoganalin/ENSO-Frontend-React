-- 退款冪等：記下 TapPay 退款成功後回傳的 refund_id。
-- 有值 = 閘道已退款；full_refund 重試時據此跳過 TapPay（避免被擋重複退款），只補完 DB。
-- 僅由 service_role（Edge Function）寫入；guard_checkout_order 對 service_role 放行，且此欄不在不可變欄位內。
alter table public.orders add column if not exists refund_gateway_ref text;
comment on column public.orders.refund_gateway_ref is
  'TapPay 退款成功後記下的 refund_id（退款冪等用：有值代表閘道已退款，重試只補 DB、不再打 TapPay）。';
