-- ============================================================================
-- supabase/scripts/reconcile-referrer-credit.sql
--
--            ⚠️  上線前專用。上線後請勿執行。 ⚠️
--
-- 用途：把 referrer_tier_snapshot 存錯人所造成的錯誤資料一次補平 ——
--       重算所有訂單的推薦人身分快照，並讓購物金帳與規則一致。
--
-- 為什麼「上線前專用」：本腳本會直接改寫、必要時刪除 store_credit_ledger
-- 的紀錄。測試資料這樣做最乾淨；但只要有過真實客戶，餘額就是別人的權益，
-- 必須改用 reverse 回沖並通知當事人，而不是把紀錄抹掉。
-- 上線後請改用 migration 006 產生的 referrer_snapshot_audit 待核對表。
--
-- 三層防呆：
--   1. 放在 scripts/ 而非 migrations/，`supabase db push` 不會執行它
--   2. 預設是「試算」模式，不寫入任何東西
--   3. 要真的寫入必須顯式帶旗標
--
-- 用法：
--   試算（只看會改什麼，不寫入）：
--     psql "$DATABASE_URL" -f reconcile-referrer-credit.sql
--   實際執行：
--     psql "$DATABASE_URL" -v apply=true -f reconcile-referrer-credit.sql
-- ============================================================================

\set ON_ERROR_STOP on
-- 未指定時預設不寫入
\if :{?apply}
\else
  \set apply false
\endif

begin;

-- ---------- 算出「正確答案」 ----------
-- 規則（對齊 src/domain/storeCredit.ts 的 creditForCompletedOrder）：
--   • 沒有推薦人 → 不發
--   • 推薦人身分不是 normal → 不發（金／銀卡只有可見度）
--   • 金額 = subtotal × app_settings.referral_cashback_rate ÷ 100，四捨五入
--   • 只有 completed 的訂單才發
create temporary table recon on commit drop as
with rate as (
  select coalesce(
           (select nullif(value #>> '{}', '')::numeric
              from public.app_settings where key = 'referral_cashback_rate'),
           0
         ) as pct
)
select
  o.id                          as order_id,
  o.order_no,
  o.status,
  o.subtotal,
  o.referrer_id,
  o.referrer_tier_snapshot      as snapshot_before,
  r.member_tier                 as referrer_tier_now,
  coalesce(e.amount, 0)         as earned_now,
  e.id                          as earn_row_id,
  case
    when o.status <> 'completed'            then 0
    when o.referrer_id is null              then 0
    when r.member_tier is distinct from 'normal' then 0
    else round(o.subtotal * (select pct from rate) / 100)::integer
  end                           as earned_should
from public.orders o
left join public.profiles r on r.id = o.referrer_id
left join public.store_credit_ledger e
       on e.order_id = o.id and e.type = 'earn';

-- ---------- 試算報表 ----------
\echo ''
\echo '=== 推薦人身分快照：將被重算的訂單 ==='
select order_no, status,
       coalesce(snapshot_before::text, '(空)') as 原快照,
       coalesce(referrer_tier_now::text, '(無推薦人)') as 將改為
from recon
where referrer_id is not null
  and snapshot_before is distinct from referrer_tier_now
order by order_no;

\echo ''
\echo '=== 購物金：與規則不符的訂單 ==='
select order_no, subtotal,
       coalesce(referrer_tier_now::text, '-') as 推薦人身分,
       earned_now as 目前已發, earned_should as 應發,
       earned_should - earned_now as 差額,
       case
         when earn_row_id is null and earned_should > 0 then '補發'
         when earn_row_id is not null and earned_should = 0 then '刪除（溢發）'
         else '修正金額'
       end as 處理
from recon
where earned_now is distinct from earned_should
order by order_no;

\echo ''

-- ---------- 實際寫入 ----------
\if :apply

  \echo '>>> apply=true：開始寫入'

  -- 1) 重算所有訂單的推薦人身分快照
  update public.orders o
     set referrer_tier_snapshot = rc.referrer_tier_now
    from recon rc
   where o.id = rc.order_id
     and rc.referrer_id is not null
     and o.referrer_tier_snapshot is distinct from rc.referrer_tier_now;

  -- 2) 溢發 → 刪除該筆 earn
  --    （測試資料才這樣做；上線後應改為 insert 一筆 reverse）
  delete from public.store_credit_ledger c
   using recon rc
   where c.id = rc.earn_row_id
     and rc.earned_should = 0;

  -- 3) 金額不符 → 修正
  update public.store_credit_ledger c
     set amount = rc.earned_should
    from recon rc
   where c.id = rc.earn_row_id
     and rc.earned_should > 0
     and c.amount is distinct from rc.earned_should;

  -- 4) 短發（完全沒發）→ 補一筆 earn
  --    效期 1 年，對齊 domain/storeCredit.ts 的 ONE_YEAR_MS
  insert into public.store_credit_ledger (member_id, type, amount, order_id, created_at, expires_at)
  select rc.referrer_id, 'earn', rc.earned_should, rc.order_id,
         coalesce((select completed_at from public.orders where id = rc.order_id), now()),
         coalesce((select completed_at from public.orders where id = rc.order_id), now()) + interval '1 year'
    from recon rc
   where rc.earn_row_id is null
     and rc.earned_should > 0;

  -- 5) 待核對表清空（那是為上線後設計的，補平後不再需要）
  delete from public.referrer_snapshot_audit;

  \echo '>>> 寫入完成'

\else
  \echo '>>> 這是試算，沒有寫入任何資料。'
  \echo '>>> 確認上面的結果無誤後，加上 -v apply=true 再跑一次。'
\endif

commit;

-- ---------- 補平後的狀態 ----------
\echo ''
\echo '=== 目前狀態 ==='
select o.order_no, o.status, o.subtotal,
       coalesce(o.referrer_tier_snapshot::text, '(空)') as 快照,
       coalesce(r.member_tier::text, '-') as 推薦人身分,
       coalesce(sum(c.amount) filter (where c.type = 'earn'), 0) as 已發購物金
  from public.orders o
  left join public.profiles r on r.id = o.referrer_id
  left join public.store_credit_ledger c on c.order_id = o.id
 where o.referrer_id is not null
 group by 1,2,3,4,5
 order by 1;
