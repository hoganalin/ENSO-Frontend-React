-- ENSO demo catalog for the shared test project.
-- Keep this idempotent so re-running deployments does not duplicate rows.
insert into public.products (title, category, price, unit, description, top_smell, heart_smell, base_smell, inventory)
select v.title, v.category, v.price, v.unit, v.description, v.top_smell, v.heart_smell, v.base_smell, v.inventory
from (values
  ('芽莊沈香 · 臥香', '沈香', 1280, '盒', '頂級芽莊沈香，沉靜悠遠。', '柑橘', '木質', '麝香', 40),
  ('老山檀香 · 線香', '檀香', 880, '盒', '印度老山檀，溫潤奶甜。', '奶香', '檀木', '琥珀', 60),
  ('和敬 · 香道禮盒', '禮盒', 2400, '組', '香道入門禮盒，附香插與香品。', '花香', '木質', '龍涎', 25)
) as v(title, category, price, unit, description, top_smell, heart_smell, base_smell, inventory)
where not exists (select 1 from public.products p where p.title = v.title);

insert into public.promotions (code, name, kind, promo_group, priority, is_auto, conditions, effect)
select 'WELCOME100', '新客折 NT$100', '固定金額', 'coupon', 30, false, '{}'::jsonb, '{"type":"fixed","amount":100}'::jsonb
where not exists (select 1 from public.promotions where code = 'WELCOME100');
