-- 20261115000001_elevate_ymck_admin.sql
-- 將客戶帳號 ymck2003@gmail.com 設為最高權限(admin)。
-- 另補「直接在資料庫確認 email」:因驗證信導回網址為 localhost,手機點開會失敗,
-- 故以 postgres 直接把 email_confirmed_at 補上,讓帳號可登入(idempotent,已確認者不覆蓋)。
-- 以 migration(postgres 角色)執行,繞過 RLS 與 guard_profile_privileges。
-- 前提:該 email 需已在前台送出註冊(auth.users 已有該列);尚未註冊則更新 0 列、不報錯。
begin;

-- 1) 直接確認信箱(避開 localhost 導回失效)
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where email = 'ymck2003@gmail.com';

-- 2) 升為 admin(最高權限)
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and u.email = 'ymck2003@gmail.com';

commit;
