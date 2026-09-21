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
