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
  create unique index if not exists uq_credit_earn_per_order
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
