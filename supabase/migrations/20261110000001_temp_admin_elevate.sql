-- ⚠️ 臨時升權（測試後台用，非正式變更）
-- 將帳號 hoganalin@gmail.com (id 30f1101a-9465-48be-908b-85d43d2f42e2) 暫時升為 admin，
-- 以便驗證後台各模組操作。測試完成後，請 db push 還原 migration 降回 customer。
-- 說明：migration 連線沒有 JWT，auth.uid() 為 null → current_role() 為 null，
--       guard_profile_privileges trigger 的 (null <> 'admin') 判定為 null、不觸發，故可直接更新。
update public.profiles
set role = 'admin'
where id = '30f1101a-9465-48be-908b-85d43d2f42e2';
