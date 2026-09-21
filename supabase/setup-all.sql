-- ============================================================================
-- ENSO · Supabase 一次性建置腳本
--
-- 內容 = schema.sql + migrations 001~006，依序串接。
-- 用法：Supabase Dashboard → SQL Editor → 貼上全部 → Run。
--
-- 全部可重複執行：連跑三次都不會出錯，也不會重複寫入資料。
--
-- 不含 supabase/scripts/reconcile-referrer-credit.sql —— 那是上線前的
-- 資料補平工具，會刪除購物金紀錄，需要時另外手動執行。
-- ============================================================================


-- ─────────────────────────────────────────────────────────────
-- schema.sql
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- ENSO 電商 · Supabase Schema (v2 — 對齊《推薦制度規格》)
-- 在 Supabase SQL Editor 貼上執行（一次跑完）。
-- 若你之前跑過 v1，請在「全新的 demo 資料庫」執行本檔
-- （v2 把 tier 改為 normal/silver/gold、移除跨層 commissions、
--   改用購物金帳 store_credit_ledger 與系統設定 app_settings）。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum (
    'customer','referral_partner','distributor',
    'support','warehouse','marketing','finance','admin'
  );
exception when duplicate_object then null; end $$;

-- 三級會員身分（金/銀卡＝管理者手動指派的經銷/代理）
do $$ begin
  create type member_tier as enum ('normal','silver','gold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum
    ('pending','paid','shipped','completed','cancelled','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type promo_group as enum ('coupon','order','shipping','gift','bundle');
exception when duplicate_object then null; end $$;

do $$ begin
  create type credit_tx_type as enum ('earn','spend','reverse','expire');
exception when duplicate_object then null; end $$;

-- ---------- profiles（會員＋身分＋推薦關係樹） ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text,
  phone         text,
  role          user_role   not null default 'customer',
  member_tier   member_tier not null default 'normal',   -- 由管理者手動升等
  referrer_id   uuid references public.profiles(id),      -- 直接推薦人（單層；註冊時綁定、永久固定）
  referral_code text unique,
  created_at    timestamptz not null default now()
);
create index if not exists idx_profiles_referrer on public.profiles(referrer_id);

-- ---------- products ----------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text,
  price        integer not null,
  origin_price integer,
  unit         text,
  description  text,
  content      text,
  image_url    text,
  images_url   jsonb not null default '[]',
  is_enabled   boolean not null default true,
  inventory    integer not null default 0,
  top_smell    text, heart_smell text, base_smell text,
  scenes       jsonb not null default '[]',
  created_at   timestamptz not null default now()
);

-- ---------- orders / order_items ----------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text unique not null default ('ENSO-' || upper(substr(md5(gen_random_uuid()::text),1,8))),
  buyer_id      uuid references public.profiles(id),
  referrer_id   uuid references public.profiles(id),     -- 推薦歸戶（下單當下買家的推薦人快照）
  subtotal      integer not null default 0,               -- 商品小計（折扣後、不含運費）→ 購物金基準
  discount      integer not null default 0,
  shipping_fee  integer not null default 0,
  total         integer not null default 0,
  status        order_status not null default 'pending',
  applied_promos jsonb not null default '[]',
  recipient     jsonb,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz                               -- 訂單完成時間（發放購物金基準）
);
create index if not exists idx_orders_buyer    on public.orders(buyer_id);
create index if not exists idx_orders_referrer on public.orders(referrer_id);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  title      text not null,
  unit_price integer not null,
  qty        integer not null
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- ---------- promotions（活動＝資料，對齊 promotions.ts） ----------
create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  kind        text,
  promo_group promo_group not null,
  priority    integer not null default 0,
  is_auto     boolean not null default false,
  is_active   boolean not null default true,
  conditions  jsonb not null default '{}',
  effect      jsonb not null default '{}',
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- store_credit_ledger（購物金帳，對齊 storeCredit.ts） ----------
-- amount 一律正值；方向由 type 決定。餘額可為負（退貨回沖後）。
create table if not exists public.store_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles(id) on delete cascade,
  type       credit_tx_type not null,           -- earn/spend/reverse/expire
  amount     integer not null check (amount >= 0),
  order_id   uuid references public.orders(id),  -- earn/reverse 對應訂單
  created_at timestamptz not null default now(),
  expires_at timestamptz                         -- 僅 earn：+1 年
);
create index if not exists idx_credit_member on public.store_credit_ledger(member_id);
create index if not exists idx_credit_order  on public.store_credit_ledger(order_id);

-- ---------- app_settings（系統設定，例如購物金比例） ----------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value) values
  ('silver_cashback_rate', '10'::jsonb),  -- 銀卡推薦回饋比例(%)，管理者可改
  ('gold_cashback_rate',   '20'::jsonb)   -- 金卡推薦回饋比例(%)，管理者可改
  on conflict (key) do nothing;

-- ---------- sms_log（購物/推薦簡訊；demo 為模擬） ----------
create table if not exists public.sms_log (
  id               uuid primary key default gen_random_uuid(),
  to_profile_id    uuid references public.profiles(id),
  to_phone         text,
  message          text not null,
  related_order_id uuid references public.orders(id),
  status           text not null default 'sent',
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 角色/身分輔助（security definer，避免 RLS 遞迴）
-- ============================================================
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('support','warehouse','marketing','finance','admin')
                   from public.profiles where id = auth.uid()), false)
$$;

-- 目前使用者是否為金/銀卡（享推薦可見度）
create or replace function public.is_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select member_tier in ('silver','gold')
                   from public.profiles where id = auth.uid()), false)
$$;

-- ============================================================
-- 新用戶自動建立 profile（含推薦碼；可帶 referrer_code 綁定推薦人）
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ref_id uuid;
begin
  if new.raw_user_meta_data ? 'referrer_code' then
    select id into ref_id from public.profiles
      where referral_code = new.raw_user_meta_data->>'referrer_code';
  end if;
  insert into public.profiles(id, name, phone, referrer_id, referral_code)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name',''),
          new.raw_user_meta_data->>'phone',
          ref_id,
          'ENSO-' || upper(substr(md5(new.id::text),1,5)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.products            enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.promotions          enable row level security;
alter table public.store_credit_ledger enable row level security;
alter table public.app_settings        enable row level security;
alter table public.sms_log             enable row level security;

-- profiles
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_staff() or referrer_id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid());

-- products / promotions / app_settings：公開可讀；管理相關角色可寫
drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (true);
drop policy if exists products_write on public.products;
create policy products_write on public.products for all
  using (public.current_role() in ('marketing','admin'))
  with check (public.current_role() in ('marketing','admin'));

drop policy if exists promotions_read on public.promotions;
create policy promotions_read on public.promotions for select using (true);
drop policy if exists promotions_write on public.promotions;
create policy promotions_write on public.promotions for all
  using (public.current_role() in ('marketing','admin'))
  with check (public.current_role() in ('marketing','admin'));

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select using (true);
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- orders：買家看自己的；staff 看全部；金/銀卡看「名下被推薦人」的訂單（可見度）
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (
  buyer_id = auth.uid()
  or public.is_staff()
  or (public.is_partner() and exists (
        select 1 from public.profiles p
        where p.id = orders.buyer_id and p.referrer_id = auth.uid()))
);
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (buyer_id = auth.uid());
drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders for update using (public.is_staff());

-- order_items：跟隨所屬訂單可見性
drop policy if exists items_read on public.order_items;
create policy items_read on public.order_items for select using (
  exists (select 1 from public.orders o
          where o.id = order_id and (
            o.buyer_id = auth.uid() or public.is_staff()
            or (public.is_partner() and exists (
                  select 1 from public.profiles p
                  where p.id = o.buyer_id and p.referrer_id = auth.uid())))));
drop policy if exists items_insert on public.order_items;
create policy items_insert on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()));

-- store_credit_ledger：本人看自己；財務/管理者看全部
drop policy if exists credit_read on public.store_credit_ledger;
create policy credit_read on public.store_credit_ledger for select using (
  member_id = auth.uid() or public.current_role() in ('finance','admin'));

-- sms_log：本人看寄給自己的；staff 看全部
drop policy if exists sms_read on public.sms_log;
create policy sms_read on public.sms_log for select using (
  to_profile_id = auth.uid() or public.is_staff());


-- ─────────────────────────────────────────────────────────────
-- 001-add-referrer-tier-snapshot.sql
-- ─────────────────────────────────────────────────────────────
-- Migration: Add referrer_tier_snapshot to orders table
-- Purpose: Store the referrer's tier at the time of purchase for accurate audit trail
-- Date: 2026-09-06

-- 補 IF NOT EXISTS：其餘 migration 都可重複執行，只有這支不行，
-- 導致整包重跑（例如重建環境、或把 schema + 001~006 串成一次性建置腳本時）
-- 會在這裡中斷。欄位說明由 006 修正為正確的語意。
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS referrer_tier_snapshot member_tier DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_referrer_tier_snapshot 
  ON public.orders(referrer_tier_snapshot);

COMMENT ON COLUMN public.orders.referrer_tier_snapshot IS 
  'Snapshot of referrer member tier at time of order completion (normal/silver/gold). Used for accurate purchase credit calculation without drift when referrer tier changes.';


-- ─────────────────────────────────────────────────────────────
-- 002-backend-alignment.sql
-- ─────────────────────────────────────────────────────────────
-- supabase/migrations/002-backend-alignment.sql
-- Phase 1：後台從六角 API 遷到 Supabase 後，補齊後台需要但 schema 尚缺的欄位／設施。
-- 可重複執行（全部 if not exists / on conflict do nothing）。

-- ---------- 1. products.feature ----------
-- 後台商品表單有「產品特色」欄位，schema.sql 沒有對應欄。
alter table public.products
  add column if not exists feature text;

-- ---------- 2. 庫存異動歷史 ----------
-- 原本寫在瀏覽器 localStorage（清快取就消失）。改為正式資料表。
do $$ begin
  create type inventory_tx_type as enum ('add', 'subtract');
exception when duplicate_object then null; end $$;

create table if not exists public.inventory_logs (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  product_title text not null,
  type         inventory_tx_type not null,
  quantity     integer not null check (quantity > 0),
  before_qty   integer not null,
  after_qty    integer not null,
  note         text,
  operator_id  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_inventory_logs_product
  on public.inventory_logs(product_id, created_at desc);

alter table public.inventory_logs enable row level security;

drop policy if exists inventory_logs_read on public.inventory_logs;
create policy inventory_logs_read on public.inventory_logs
  for select using (public.is_staff());

drop policy if exists inventory_logs_write on public.inventory_logs;
create policy inventory_logs_write on public.inventory_logs
  for insert with check (
    public.current_role() in ('warehouse', 'marketing', 'admin')
  );

-- ---------- 3. 訂單：staff 可刪 ----------
-- schema.sql 只給了 orders 的 select / insert / update，
-- 後台的「刪除訂單 / 清空訂單」需要 delete policy。
drop policy if exists orders_staff_delete on public.orders;
create policy orders_staff_delete on public.orders
  for delete using (public.current_role() in ('admin', 'support'));

drop policy if exists items_staff_delete on public.order_items;
create policy items_staff_delete on public.order_items
  for delete using (public.current_role() in ('admin', 'support'));

-- 後台改訂單明細數量需要 update 權限
drop policy if exists items_staff_update on public.order_items;
create policy items_staff_update on public.order_items
  for update using (public.is_staff());

-- ---------- 4. 商品圖片 Storage bucket ----------
insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects
  for insert with check (
    bucket_id = 'product-images'
    and public.current_role() in ('marketing', 'admin')
  );

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects
  for delete using (
    bucket_id = 'product-images'
    and public.current_role() in ('marketing', 'admin')
  );


-- ─────────────────────────────────────────────────────────────
-- 003-member-admin.sql
-- ─────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────
-- 004-member-campaigns.sql
-- ─────────────────────────────────────────────────────────────
-- supabase/migrations/004-member-campaigns.sql
-- Phase 2：會員活動（生日禮／首購／回購）所需的欄位與索引。
-- 可重複執行。

-- ---------- 1. 生日 ----------
-- 生日禮活動需要，但原本 schema 沒有這一欄。
-- 存 date 而非 timestamptz：生日沒有時間，也不該被時區推移一天。
alter table public.profiles
  add column if not exists birthday date;

-- ---------- 2. 首購／回購判定的索引 ----------
-- 結帳時要算「這位買家已完成幾筆訂單」，會打
--   select count(*) from orders where buyer_id = ? and status in (...)
-- idx_orders_buyer 已存在，這裡補上含 status 的複合索引。
create index if not exists idx_orders_buyer_status
  on public.orders(buyer_id, status);

-- ---------- 3. 生日欄位的存取規則 ----------
-- 生日屬於個資：本人可讀寫（走既有的 profiles_self_read / self_update），
-- staff 可讀（既有 is_staff() 條款）。這裡不需要新 policy，
-- 但要確認 003 的 guard trigger 不會擋住本人改自己的生日 ——
-- 該 trigger 只管 role / member_tier / referrer_id，birthday 不在其中。

-- ---------- 5. member_summary 補上 birthday ----------
-- 003 建的 view 沒有這一欄（當時 birthday 還不存在）。
-- CREATE OR REPLACE VIEW 只允許在「欄位清單最後」新增欄位，
-- 所以 birthday 放在最末，其餘順序保持與 003 完全一致。
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
  coalesce(d.downline_count, 0) as downline_count,
  p.birthday
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

-- ---------- 6. 範例活動（可選，執行後可在後台看到並修改）----------
-- 註解掉；要試跑再打開。
--
-- insert into public.promotions
--   (code, name, kind, promo_group, priority, is_auto, is_active, conditions, effect)
-- values
--   (null, '生日當月 88 折', '會員活動', 'coupon', 60, true, true,
--    '{"birthday_month": true}'::jsonb, '{"type":"percent","rate":0.12}'::jsonb),
--   (null, '首購折 NT$150', '會員活動', 'coupon', 55, true, true,
--    '{"first_purchase": true}'::jsonb, '{"type":"fixed","amount":150}'::jsonb),
--   (null, '回購免運', '會員活動', 'shipping', 20, true, true,
--    '{"repeat_purchase": true, "min_orders": 1}'::jsonb, '{"free_ship":true}'::jsonb)
-- on conflict do nothing;


-- ─────────────────────────────────────────────────────────────
-- 005-payment-invoice.sql
-- ─────────────────────────────────────────────────────────────
-- supabase/migrations/005-payment-invoice.sql
-- Phase 3：金流（綠界 ECPay）／電子發票／簡訊搬到 Edge Function 之後，
-- 伺服器端需要的資料表與欄位。可重複執行。
--
-- 對應的程式碼：
--   supabase/functions/payment-create/index.ts
--   supabase/functions/payment-notify/index.ts
--
-- 注意 RLS：Edge Function 用的是 service_role key，**完全繞過 RLS**，
-- 所以下面的 policy 都只在管「登入使用者／後台人員能看到什麼」，
-- 寫入權限刻意不開給任何人（沒有 insert/update policy = 只有 service_role 能寫）。
-- 這一點很重要：付款紀錄與發票號碼絕對不能讓瀏覽器端改。

-- ---------- 0. 合併 supabase/003-extend-sms-log.sql ----------
-- 那個檔案原本被放在 supabase/ 根目錄（不在 migrations/ 裡），
-- 檔名編號又跟 migrations/003-member-admin.sql 撞號，很容易被漏跑或跑錯順序。
-- 內容併到這裡（全部 if not exists，已經跑過也不會出錯），原檔已移除。
alter table public.sms_log
  add column if not exists mitake_msgid text,            -- 三竹回傳的 msgid，用來查送達狀態
  add column if not exists error_message text,           -- 發送失敗原因（人工補發的依據）
  add column if not exists payment_reference_id text;    -- 綠界 TradeNo，對帳用

create index if not exists idx_sms_log_mitake_msgid
  on public.sms_log(mitake_msgid);
create index if not exists idx_sms_log_payment_ref
  on public.sms_log(payment_reference_id);
-- 後台「某張訂單發了哪些簡訊」會用到
create index if not exists idx_sms_log_order
  on public.sms_log(related_order_id, created_at desc);

-- ---------- 1. orders：付款結果欄位 ----------
-- completed_at 已存在（發購物金的基準時間），但「付款時間」與「付款方式」
-- 原本沒地方放，對帳時只能翻綠界後台。
alter table public.orders
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text,               -- 綠界回傳的 PaymentType，如 Credit_CreditCard
  add column if not exists payment_gateway_trade_no text;     -- 綠界的 TradeNo

create index if not exists idx_orders_gateway_trade_no
  on public.orders(payment_gateway_trade_no);

-- ---------- 2. payment_transactions（每一次「發起付款」一列）----------
-- 為什麼需要這張表，而不是只在 orders 上加欄位：
--   (a) 綠界的 MerchantTradeNo 限定 ^\w{4,20}$，訂單的 order_no（ENSO-XXXXXXXX）
--       含 `-` 不合法，必須轉成 ENSO_XXXXXXXX 才能送出。回調回來時要能對得回訂單，
--       所以「我們到底送了哪個編號」必須存下來。
--   (b) 同一張訂單可能付款失敗後重新付，MerchantTradeNo 在同一商店必須唯一，
--       所以要用 attempt 遞增產生新編號，而歷史每一筆都要留著。
--   (c) raw_notify 留原始回調內容，出事時才有辦法跟綠界對帳。
create table if not exists public.payment_transactions (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  provider          text not null default 'ecpay',
  -- 送給綠界的 MerchantTradeNo。unique 是冪等的關鍵之一：
  -- 回調靠這個欄位定位交易，重複的編號會讓定位失效。
  merchant_trade_no text not null unique,
  attempt           integer not null default 1,
  -- 發起付款時從 DB 重算出來的金額。回調的 TradeAmt 必須等於這個值，
  -- 否則就是被竄改（或我們自己算錯），一律拒絕完成訂單。
  amount            integer not null check (amount >= 1),
  status            text not null default 'pending'
                      check (status in ('pending','paid','failed')),
  gateway_trade_no  text,      -- 綠界 TradeNo
  payment_type      text,      -- 綠界 PaymentType
  paid_at           timestamptz,
  raw_notify        jsonb,     -- 原始回調（稽核／對帳用）
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_payment_tx_order
  on public.payment_transactions(order_id, attempt desc);
create index if not exists idx_payment_tx_status
  on public.payment_transactions(status, created_at desc);

alter table public.payment_transactions enable row level security;

-- 買家看自己訂單的付款紀錄；staff 看全部。沒有任何 insert/update policy，
-- 也就是只有 service_role（Edge Function）能寫。
drop policy if exists payment_tx_read on public.payment_transactions;
create policy payment_tx_read on public.payment_transactions
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = payment_transactions.order_id and o.buyer_id = auth.uid()
    )
  );

-- ---------- 3. invoices（電子發票）----------
-- 一張訂單一張發票 → order_id unique（payment-notify 用 upsert onConflict=order_id）。
-- status 的語意：
--   pending = 該開但還沒開（含「發票功能尚未啟用」）
--   issued  = 綠界已回傳發票號碼
--   failed  = 呼叫綠界失敗，error_message 有原因，需重試或人工處理
--   voided  = 已作廢（目前程式還沒有作廢流程，保留給後台）
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders(id) on delete cascade,
  provider         text not null default 'ecpay',
  -- 送給綠界的自訂編號（RelateNumber），我們用 order_no。
  relate_number    text not null,
  invoice_number   text,        -- 發票號碼，例如 AB12345678
  invoice_date     text,        -- 綠界回傳的字串格式，原樣保留不做轉換
  random_number    text,        -- 發票隨機碼（對獎用，4 碼）
  amount           integer not null check (amount >= 0),
  status           text not null default 'pending'
                     check (status in ('pending','issued','failed','voided')),
  buyer_name       text,
  buyer_email      text,
  buyer_phone      text,
  buyer_identifier text,        -- 統一編號（8 碼）
  carrier_type     text,        -- 載具類型：''/1/2/3
  carrier_num      text,        -- 載具號碼（手機條碼等）
  love_code        text,        -- 捐贈碼
  request_payload  jsonb,
  response_payload jsonb,
  error_message    text,
  issued_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_invoices_status
  on public.invoices(status, created_at desc);
create index if not exists idx_invoices_number
  on public.invoices(invoice_number);

alter table public.invoices enable row level security;

-- staff 可讀全部；買家可讀自己訂單的發票（要查發票號碼）。
-- 同樣沒有寫入 policy → 只有 service_role 能開票。
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = invoices.order_id and o.buyer_id = auth.uid()
    )
  );

-- ---------- 4. 購物金重複發放：DB 層的最後一道防線 ----------
-- payment-notify 已經在程式裡查過「這筆訂單有沒有 earn」，但那是樂觀檢查：
-- 綠界重送 + 使用者重整可能讓兩個請求同時通過檢查，然後各插一筆。
-- 唯一索引是唯一能擋住併發的方法（程式碼會把 23505 當成「已發過」處理）。
--
-- 如果這裡失敗，代表資料庫裡已經有重複發放的資料 —— 那是必須人工處理的帳務問題，
-- 所以只發 notice 不讓整個 migration 中斷（其他物件還是要建起來）。
do $$ begin
  create unique index uq_credit_earn_per_order
    on public.store_credit_ledger(order_id)
    where type = 'earn' and order_id is not null;
exception
  when duplicate_table then null;   -- 索引已存在
  when unique_violation then
    raise notice '⚠️ store_credit_ledger 已存在同一訂單多筆 earn，唯一索引未建立。請先執行下列查詢人工處理：';
    raise notice 'select order_id, count(*) from public.store_credit_ledger where type = ''earn'' and order_id is not null group by 1 having count(*) > 1;';
end $$;

-- ---------- 5. updated_at 自動更新 ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists payment_tx_touch on public.payment_transactions;
create trigger payment_tx_touch before update on public.payment_transactions
  for each row execute function public.touch_updated_at();

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ---------- 6. 還沒做、但建議儘快補的事（留紀錄，不在本檔執行）----------
-- orders 的 insert policy 目前是 `with check (buyer_id = auth.uid())`，
-- 只檢查「是不是自己的訂單」，不檢查金額 —— 也就是瀏覽器可以自己 insert
-- 一張 total = 1 的訂單。payment-create 會拿 order_items 對 products.price
-- 重新驗算並擋下來，但那是應用層的補救，不是根治。
-- 根治方式（需要與結帳流程一起改，故不放進這支 migration）：
--   (a) 訂單改由 Edge Function 建立，orders 完全不開 insert 給前端；或
--   (b) 加一個 trigger，insert 時用 order_items × products.price 重算 subtotal/total。


-- ─────────────────────────────────────────────────────────────
-- 006-fix-referrer-tier-snapshot.sql
-- ─────────────────────────────────────────────────────────────
-- supabase/migrations/006-fix-referrer-tier-snapshot.sql
--
-- 修正 orders.referrer_tier_snapshot 的既有錯誤資料。
--
-- 背景：placeOrder() 原本查「買家」的 member_tier 卻存進 referrer_tier_snapshot
-- （查詢條件是 profiles.eq("id", buyerId)）。購物金資格只看這個欄位
-- （只有 normal 身分的推薦人能領），所以兩個方向都會算錯錢：
--   • 買家 normal、推薦人金卡 → 快照 normal → 金卡被錯發購物金
--   • 買家金卡、推薦人 normal → 快照 gold   → 有資格的人被錯扣
-- 程式碼已修（src/services/db/checkout.ts 的 fetchReferrerTier()）。
-- 本檔處理已經寫進資料庫的錯誤快照。
--
-- 可重複執行。

-- ---------- 1. 修正 001 的欄位說明 ----------
-- 原說明寫 "at time of order completion"，實際上是在「下單時」寫入的。
comment on column public.orders.referrer_tier_snapshot is
  '下單當下「推薦人」的會員等級快照（normal/silver/gold），用於計算推薦購物金，'
  '避免推薦人日後升降等造成金額漂移。由 placeOrder() 在建立訂單時寫入；'
  'NULL 表示無推薦人或當時取不到，此時完成訂單會退回查推薦人當下身分。';

-- ---------- 2. 未完成訂單：清掉錯誤快照 ----------
-- 這些訂單還沒發過購物金，把快照設為 NULL 是安全且正確的做法 ——
-- completeOrder() / payment-notify 遇到 NULL 會改查推薦人當下身分。
--
-- 判定「錯誤」的條件：快照與推薦人當下身分不符。
-- 對未完成訂單來說，就算推薦人是在下單後才升降等，改查當下身分仍然
-- 比一個已知來源錯誤的值更可信，所以一律清掉。
do $$
declare
  affected integer;
begin
  with bad as (
    select o.id
    from public.orders o
    join public.profiles r on r.id = o.referrer_id
    where o.referrer_tier_snapshot is not null
      and o.status not in ('completed')
      and o.referrer_tier_snapshot is distinct from r.member_tier
  )
  update public.orders o
     set referrer_tier_snapshot = null
    from bad
   where o.id = bad.id;

  get diagnostics affected = row_count;
  raise notice '[006] 已清理 % 筆未完成訂單的錯誤快照（將於完成時改查推薦人當下身分）', affected;
end $$;

-- ---------- 3. 已完成訂單：只做標記，不自動改金額 ----------
-- 這些訂單的購物金已經發出（或已被錯誤地不發），金額牽涉真實權益，
-- 不該由 migration 悄悄改寫。這裡只建立一個待核對清單供人工處理。
--
-- 注意：快照與推薦人當下身分不符，並不等於一定是本 bug ——
-- 推薦人也可能在訂單完成後才合法升降等。所以這是「待核對」而非「確定錯誤」。
-- 下面多比對一個訊號：快照剛好等於「買家」當下的身分，
-- 那就高度符合本 bug 的特徵（存錯人），列為 high 信心。

create table if not exists public.referrer_snapshot_audit (
  order_id            uuid primary key references public.orders(id) on delete cascade,
  order_no            text not null,
  completed_at        timestamptz,
  subtotal            integer not null,
  referrer_id         uuid,
  snapshot_tier       member_tier,
  referrer_tier_now   member_tier,
  buyer_tier_now      member_tier,
  credit_issued       integer not null default 0,
  confidence          text not null,
  resolved            boolean not null default false,
  note                text,
  created_at          timestamptz not null default now()
);

alter table public.referrer_snapshot_audit enable row level security;

drop policy if exists snapshot_audit_read on public.referrer_snapshot_audit;
create policy snapshot_audit_read on public.referrer_snapshot_audit
  for select using (public.current_role() in ('finance', 'admin'));

drop policy if exists snapshot_audit_write on public.referrer_snapshot_audit;
create policy snapshot_audit_write on public.referrer_snapshot_audit
  for update using (public.current_role() in ('finance', 'admin'))
  with check (public.current_role() in ('finance', 'admin'));

insert into public.referrer_snapshot_audit (
  order_id, order_no, completed_at, subtotal, referrer_id,
  snapshot_tier, referrer_tier_now, buyer_tier_now, credit_issued, confidence
)
select
  o.id,
  o.order_no,
  o.completed_at,
  o.subtotal,
  o.referrer_id,
  o.referrer_tier_snapshot,
  r.member_tier,
  b.member_tier,
  coalesce(c.issued, 0),
  case
    when o.referrer_tier_snapshot = b.member_tier then 'high'
    else 'review'
  end
from public.orders o
join public.profiles r on r.id = o.referrer_id
left join public.profiles b on b.id = o.buyer_id
left join lateral (
  select sum(amount) as issued
  from public.store_credit_ledger
  where order_id = o.id and type = 'earn'
) c on true
where o.status = 'completed'
  and o.referrer_tier_snapshot is not null
  and o.referrer_tier_snapshot is distinct from r.member_tier
on conflict (order_id) do nothing;

do $$
declare
  pending integer;
  high    integer;
begin
  select count(*), count(*) filter (where confidence = 'high')
    into pending, high
  from public.referrer_snapshot_audit
  where not resolved;

  if pending > 0 then
    raise notice '[006] 有 % 筆已完成訂單的推薦人快照待人工核對（其中 % 筆高度符合本 bug 特徵）。', pending, high;
    raise notice '[006] 查詢：select * from public.referrer_snapshot_audit where not resolved order by confidence, completed_at;';
    raise notice '[006] 核對後請自行調整 store_credit_ledger（earn 補發 / reverse 回沖），並把該列的 resolved 設為 true。';
  else
    raise notice '[006] 沒有已完成訂單需要核對。';
  end if;
end $$;

-- ---------- 4. 索引 ----------
create index if not exists idx_snapshot_audit_unresolved
  on public.referrer_snapshot_audit(resolved, confidence);

