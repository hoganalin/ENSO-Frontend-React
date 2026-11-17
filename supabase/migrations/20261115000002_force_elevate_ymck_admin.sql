-- 20261115000002_force_elevate_ymck_admin.sql
-- 補救:前一支 20261115000001 可能在帳號尚未註冊時就被 db push 套用過(當時更新 0 列),
-- 之後因「版本已套用」而被 db push 略過,導致 ymck2003 未升權。
-- 本檔以新版本號強制重跑:確認信箱 + 升為 admin。idempotent。
begin;

-- 1) 直接確認信箱(避開 localhost 導回失效)
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) = 'ymck2003@gmail.com';

-- 2) 升為 admin(最高權限)
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'ymck2003@gmail.com';

commit;
