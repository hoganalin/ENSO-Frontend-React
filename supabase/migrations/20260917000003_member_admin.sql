-- supabase/migrations/003-member-admin.sql
-- Phase 1：後台會員管理所需的權限與索引。
-- 可重複執行。

-- ---------- 1. staff 可讀、admin 可改 profiles ----------
-- 現況問題：schema.sql 的 profiles_self_update 是
--   for update using (id = auth.uid())
-- 也就是「只有本人能改自己」。後台要手動升等會員（normal→silver/gold）
-- 或指派角色時，會被 RLS 靜默擋下——UPDATE 影響 0 列卻不報錯，
-- 畫面看起來成功、資料其實沒變。這裡補上管理者的 update policy。

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ---------- 2. 防止自我提權 ----------
-- 只有 admin 能改 role／member_tier；本人透過 profiles_self_update
-- 仍可改自己的 name/phone，但不能把自己升成 admin 或金卡。
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role
      or new.member_tier is distinct from old.member_tier)
     and public.current_role() <> 'admin' then
    raise exception '只有管理者可以變更角色或會員等級';
  end if;

  -- 推薦關係一旦綁定就永久固定（對齊推薦制度規格）
  if new.referrer_id is distinct from old.referrer_id then
    raise exception '推薦關係不可變更';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ---------- 3. 會員管理常用查詢的索引 ----------
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_tier on public.profiles(member_tier);
create index if not exists idx_profiles_created on public.profiles(created_at desc);

-- ---------- 4. 會員彙總 view ----------
-- 後台列表要顯示每位會員的訂單數／消費額／購物金餘額。
-- 在 DB 端彙總，避免前端 N+1 查詢。
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
  coalesce(d.downline_count, 0) as downline_count
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

-- security_invoker = true：view 以查詢者的身分執行，
-- 所以 profiles / orders / store_credit_ledger 的 RLS 仍然生效，
-- 一般會員查這個 view 只會看到自己那一列。
