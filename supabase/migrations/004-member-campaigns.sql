-- supabase/migrations/004-member-campaigns.sql
-- Phase 2：會員活動（生日禮／首購／回購）所需的欄位與索引。
-- 可重複執行。

-- ---------- 1. 生日 ----------
-- 生日禮活動需要，但原本 schema 沒有這一欄。
-- 存 date 而非 timestamptz：生日沒有時間，也不該被時區推移一天。
alter table public.profiles
  add column if not exists birthday date;

-- ---------- 2. 首購／回購判定的索引 ----------
-- 結帳時要算「這位買家已完成幾筆訂單」，會打
--   select count(*) from orders where buyer_id = ? and status in (...)
-- idx_orders_buyer 已存在，這裡補上含 status 的複合索引。
create index if not exists idx_orders_buyer_status
  on public.orders(buyer_id, status);

-- ---------- 3. 生日欄位的存取規則 ----------
-- 生日屬於個資：本人可讀寫（走既有的 profiles_self_read / self_update），
-- staff 可讀（既有 is_staff() 條款）。這裡不需要新 policy，
-- 但要確認 003 的 guard trigger 不會擋住本人改自己的生日 ——
-- 該 trigger 只管 role / member_tier / referrer_id，birthday 不在其中。

-- ---------- 5. member_summary 補上 birthday ----------
-- 003 建的 view 沒有這一欄（當時 birthday 還不存在）。
-- CREATE OR REPLACE VIEW 只允許在「欄位清單最後」新增欄位，
-- 所以 birthday 放在最末，其餘順序保持與 003 完全一致。
-- 先 drop 再建：CREATE OR REPLACE VIEW 不允許減少欄位，
-- 而 004 會在本 view 末端追加 birthday。若整包 migration 重跑，
-- 這支會想用「較少的欄位」覆蓋回去而報 cannot drop columns from view。
-- view 沒有其他物件相依，drop 後重建是安全的。
drop view if exists public.member_summary;
create view public.member_summary
with (security_invoker = true) as
select
  p.id,
  p.name,
  p.phone,
  p.role,
  p.member_tier,
  p.referrer_id,
  p.referral_code,
  p.created_at,
  ref.name          as referrer_name,
  ref.referral_code as referrer_code,
  coalesce(o.order_count, 0)   as order_count,
  coalesce(o.total_spent, 0)   as total_spent,
  coalesce(c.credit_balance, 0) as credit_balance,
  coalesce(d.downline_count, 0) as downline_count,
  p.birthday
from public.profiles p
left join public.profiles ref on ref.id = p.referrer_id
left join lateral (
  select count(*) as order_count,
         sum(total) as total_spent
  from public.orders
  where buyer_id = p.id
    and status in ('paid', 'shipped', 'completed')
) o on true
left join lateral (
  select sum(case when type in ('earn') then amount else -amount end) as credit_balance
  from public.store_credit_ledger
  where member_id = p.id
) c on true
left join lateral (
  select count(*) as downline_count
  from public.profiles child
  where child.referrer_id = p.id
) d on true;

-- ---------- 6. 範例活動（可選，執行後可在後台看到並修改）----------
-- 註解掉；要試跑再打開。
--
-- insert into public.promotions
--   (code, name, kind, promo_group, priority, is_auto, is_active, conditions, effect)
-- values
--   (null, '生日當月 88 折', '會員活動', 'coupon', 60, true, true,
--    '{"birthday_month": true}'::jsonb, '{"type":"percent","rate":0.12}'::jsonb),
--   (null, '首購折 NT$150', '會員活動', 'coupon', 55, true, true,
--    '{"first_purchase": true}'::jsonb, '{"type":"fixed","amount":150}'::jsonb),
--   (null, '回購免運', '會員活動', 'shipping', 20, true, true,
--    '{"repeat_purchase": true, "min_orders": 1}'::jsonb, '{"free_ship":true}'::jsonb)
-- on conflict do nothing;
