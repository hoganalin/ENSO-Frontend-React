-- ⚠️ 臨時升權（驗證後台看得到前台購買用，測後還原）
-- 將 hoganalin@gmail.com (id 30f1101a-9465-48be-908b-85d43d2f42e2) 暫升為 admin。
-- migration 連線 auth.uid() 為 null → current_role() 為 null，guard trigger 不觸發。
update public.profiles
set role = 'admin'
where id = '30f1101a-9465-48be-908b-85d43d2f42e2';
