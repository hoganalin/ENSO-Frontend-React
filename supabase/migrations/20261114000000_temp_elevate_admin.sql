-- 20261114000000_temp_elevate_admin.sql
-- 臨時：把測試帳號（姓名=許志豪）升為 admin，以便使用後台「人工調整購物金」等功能與測試 F1。
-- 以 migration（postgres 角色）執行，不受 guard_profile_privileges 阻擋。
-- 測試完成後，把 'admin' 改為 'customer' 再 push 一次即可還原。
update public.profiles set role = 'admin' where name = '許志豪';
