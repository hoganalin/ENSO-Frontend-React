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
