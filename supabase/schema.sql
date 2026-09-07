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
insert into public.app_settings(key, value)
  values ('referral_cashback_rate', '10'::jsonb)   -- 全站購物金比例(%)，管理者可改
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
