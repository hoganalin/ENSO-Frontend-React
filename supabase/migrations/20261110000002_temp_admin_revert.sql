-- 還原臨時升權：測試完成，將 hoganalin@gmail.com (id 30f1101a-...) 降回 customer。
-- 與升權檔同理，migration 連線 auth.uid() 為 null，guard trigger 不觸發。
update public.profiles
set role = 'customer'
where id = '30f1101a-9465-48be-908b-85d43d2f42e2';
