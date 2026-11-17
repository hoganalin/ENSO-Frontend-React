-- 20261114000001_temp_elevate_and_seed.sql
-- 臨時（測試用）：以 auth email 精準指定帳號，升為 admin 並灌 500 測試購物金。
-- 用 email 是因為該帳號 profiles.name/phone 可能為空，name 比對會漏。
-- 以 migration（postgres 角色）執行，不受 RLS / guard_profile_privileges 阻擋。
-- 測試完成後可刪除本檔並手動還原 role 與移除該筆 earn。
begin;

-- 1) 升為 admin
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id and u.email = 'hoganalin@gmail.com';

-- 2) 灌 500 測試購物金（earn，一年到期）；idempotent：已有同備註者不重複
insert into public.store_credit_ledger (member_id, type, amount, created_at, expires_at, note)
select u.id, 'earn', 500, now(), now() + interval '365 days', '測試種子：F1 驗證'
from auth.users u
where u.email = 'hoganalin@gmail.com'
  and not exists (
    select 1 from public.store_credit_ledger l
    where l.member_id = u.id and l.note = '測試種子：F1 驗證'
  );

commit;
