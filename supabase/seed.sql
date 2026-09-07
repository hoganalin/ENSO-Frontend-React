-- ============================================================
-- ENSO · Supabase 種子資料（demo 用）
-- 在 schema.sql 之後執行。商品與活動可直接種；
-- 會員需先透過 Supabase Auth 建立（見檔末說明）。
-- ============================================================

-- ---------- 商品 ----------
insert into public.products (title, category, price, unit, description, top_smell, heart_smell, base_smell, inventory)
values
  ('芽莊沈香 · 臥香', '沈香', 1280, '盒', '頂級芽莊沈香，沉靜悠遠。', '柑橘', '木質', '麝香', 40),
  ('老山檀香 · 線香', '檀香', 880,  '盒', '印度老山檀，溫潤奶甜。',   '奶香', '檀木', '琥珀', 60),
  ('和敬 · 香道禮盒', '禮盒', 2400, '組', '香道入門禮盒，附香插與香品。','花香','木質','龍涎', 25)
on conflict do nothing;

-- ---------- 活動（對齊 promotions.ts 的 demoPromos） ----------
-- 優惠券：固定金額
insert into public.promotions (code, name, kind, promo_group, priority, is_auto, conditions, effect)
values ('WELCOME100','新客折 NT$100','固定金額','coupon',30,false,
        '{}'::jsonb, '{"type":"fixed","amount":100}'::jsonb)
on conflict (code) do nothing;

-- 優惠券：百分比 · 指定商品（老山檀香）
insert into public.promotions (code, name, kind, promo_group, priority, is_auto, conditions, effect)
select 'INCENSE15','指定商品 85 折','百分比·指定商品','coupon',40,false,
       jsonb_build_object('product_id', p.id),
       '{"type":"percent_on_product","rate":0.15}'::jsonb
from public.products p where p.title = '老山檀香 · 線香'
on conflict (code) do nothing;

-- 優惠券：百分比 · 指定會員（VIP）
insert into public.promotions (code, name, kind, promo_group, priority, is_auto, conditions, effect)
values ('VIP20','VIP 專屬 8 折','百分比·指定會員','coupon',50,false,
        '{"member_tier":"vip"}'::jsonb, '{"type":"percent","rate":0.2}'::jsonb)
on conflict (code) do nothing;

-- 自動：滿額折
insert into public.promotions (name, kind, promo_group, priority, is_auto, conditions, effect)
select '滿 NT$2,000 折 NT$200','滿額折','order',45,true,
       '{"min_subtotal":2000}'::jsonb, '{"type":"fixed","amount":200}'::jsonb
where not exists (select 1 from public.promotions where name='滿 NT$2,000 折 NT$200');

-- 自動：滿額免運
insert into public.promotions (name, kind, promo_group, priority, is_auto, conditions, effect)
select '滿 NT$1,500 免運','滿額免運','shipping',10,true,
       '{"min_subtotal":1500}'::jsonb, '{"free_ship":true}'::jsonb
where not exists (select 1 from public.promotions where name='滿 NT$1,500 免運');

-- 自動：滿額贈
insert into public.promotions (name, kind, promo_group, priority, is_auto, conditions, effect)
select '滿 NT$3,000 送黃銅香插','滿額贈','gift',5,true,
       '{"min_subtotal":3000}'::jsonb, '{"gift":"黃銅香插 ×1"}'::jsonb
where not exists (select 1 from public.promotions where name='滿 NT$3,000 送黃銅香插');

-- ============================================================
-- 會員（需先在 Supabase 建立 Auth 使用者，再執行以下設定）
-- ------------------------------------------------------------
-- 步驟：Supabase 後台 → Authentication → Users → Add user，建三個帳號：
--   a@enso.demo（林雅琴/推薦夥伴）、b@enso.demo（陳志明）、c@enso.demo（王小美）
-- 建立後 handle_new_user 觸發器會自動幫每人產生 profile 與推薦碼。
-- 再執行下面把角色、分級與推薦鏈設定好（依 email 對應）：
--
--   update public.profiles set name='林雅琴', role='referral_partner', member_tier='gold'
--     where id=(select id from auth.users where email='a@enso.demo');
--   update public.profiles set name='陳志明',
--     referrer_id=(select id from auth.users where email='a@enso.demo')
--     where id=(select id from auth.users where email='b@enso.demo');
--   update public.profiles set name='王小美',
--     referrer_id=(select id from auth.users where email='b@enso.demo')
--     where id=(select id from auth.users where email='c@enso.demo');
--
-- 另外把你自己的帳號設為最高管理者，才能進後台：
--   update public.profiles set role='admin' where id=(select id from auth.users where email='你的email');
-- ============================================================
