-- ============================================================
-- ENSO 待補 migration · 第 6/7 段 
-- 內含 4 支 migration，每支自帶 begin/commit，可安全重複執行
-- 在 Supabase SQL Editor 整段貼上按 Run；若出錯，修好後原樣重跑即可
-- ============================================================


-- ==== 20260919000008_exchange_shipments.sql ====

begin;
-- Same-SKU exchanges ship only against an already inspected return receipt.
create table if not exists public.exchange_shipments(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 receipt_id uuid not null references public.return_receipts(id),quantity integer not null check(quantity>0),
 request_key uuid not null unique,tracking_number text not null check(length(trim(tracking_number)) between 1 and 100),
 shipped_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.exchange_shipments enable row level security;
grant select on public.exchange_shipments to authenticated;
grant all on public.exchange_shipments to service_role;
drop policy if exists exchange_shipments_read on public.exchange_shipments;
create policy exchange_shipments_read on public.exchange_shipments for select using(public.current_role() in ('admin','warehouse','finance','support') or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
create or replace function public.ship_order_exchange(p_actor uuid,p_order uuid,p_receipt uuid,p_quantity integer,p_request_key uuid,p_tracking text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; ord public.orders%rowtype; receipt public.return_receipts%rowtype; item public.order_items%rowtype; product public.products%rowtype; shipment public.exchange_shipments%rowtype; shipped bigint;
begin
 select role::text into actor_role from public.profiles where id=p_actor;
 if actor_role is null or actor_role not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 select * into shipment from public.exchange_shipments where request_key=p_request_key;
 if found then
  if shipment.order_id<>p_order or shipment.receipt_id<>p_receipt or shipment.quantity<>p_quantity or shipment.tracking_number<>trim(p_tracking) then raise exception 'Request key conflict'; end if;
  return to_jsonb(shipment);
 end if;
 if p_request_key is null or p_quantity is null or p_quantity<1 or coalesce(length(trim(p_tracking)),0) not between 1 and 100 then raise exception 'Invalid shipment'; end if;
 if ord.status not in ('shipped','completed') then raise exception 'Order not eligible for exchange'; end if;
 -- Refunds and replacements cannot be awarded together for the same order.
 if exists(select 1 from public.refund_requests where order_id=p_order and status<>'rejected') then raise exception 'Resolve refund before exchange'; end if;
 select * into receipt from public.return_receipts where id=p_receipt and order_id=p_order;
 if not found then raise exception 'Return receipt not found'; end if;
 select coalesce(sum(quantity),0) into shipped from public.exchange_shipments where receipt_id=p_receipt;
 if shipped+p_quantity>receipt.quantity then raise exception 'Exchange exceeds received quantity'; end if;
 select * into item from public.order_items where id=receipt.order_item_id;
 select * into product from public.products where id=item.product_id for update;
 if not found or product.inventory<p_quantity then raise exception 'Insufficient inventory'; end if;
 update public.products set inventory=inventory-p_quantity where id=product.id;
 insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id) values(product.id,product.title,'subtract',p_quantity,product.inventory,product.inventory-p_quantity,'換貨重寄 '||ord.order_no||'：'||trim(p_tracking),p_actor);
 insert into public.exchange_shipments(order_id,receipt_id,quantity,request_key,tracking_number,shipped_by) values(p_order,p_receipt,p_quantity,p_request_key,trim(p_tracking),p_actor) returning * into shipment;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'exchange_shipped',p_order,jsonb_build_object('shipment_id',shipment.id,'receipt_id',p_receipt,'quantity',p_quantity,'tracking',trim(p_tracking)));
 return to_jsonb(shipment);
end $$;
revoke all on function public.ship_order_exchange(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.ship_order_exchange(uuid,uuid,uuid,integer,uuid,text) to service_role;
-- Do not accept an independent refund for an order whose goods were replaced.
create or replace function public.guard_refund_after_exchange() returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from public.orders where id=new.order_id for update;
 if exists(select 1 from public.exchange_shipments where order_id=new.order_id) then raise exception 'Exchange already shipped; contact support'; end if;
 return new;
end $$;
drop trigger if exists guard_refund_after_exchange on public.refund_requests;
create trigger guard_refund_after_exchange before insert on public.refund_requests for each row execute function public.guard_refund_after_exchange();
commit;


-- ==== 20260920000002_credit_reconciliation.sql ====

begin;
create table if not exists public.credit_reconciliations (
 id uuid primary key,
 member_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id),
 ledger_count bigint not null,
 ledger_balance bigint not null,
 note text not null,
 created_at timestamptz not null default now()
);
alter table public.credit_reconciliations enable row level security;
grant select on public.credit_reconciliations to authenticated;
drop policy if exists credit_reconciliations_read on public.credit_reconciliations;
create policy credit_reconciliations_read on public.credit_reconciliations for select to authenticated using(public.current_role() in ('finance','admin'));
create or replace function public.reconcile_credit(p_request uuid,p_member uuid,p_note text) returns public.credit_reconciliations
language plpgsql security definer set search_path=public as $$
declare result public.credit_reconciliations; n bigint; balance bigint;
begin
 if auth.uid() is null or coalesce(public.current_role()::text,'') not in ('finance','admin') then raise exception 'Forbidden'; end if;
 if p_request is null or length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Reconciliation note required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,2));
 select * into result from public.credit_reconciliations where id=p_request;
 if found then
  if result.member_id<>p_member or result.note<>trim(p_note) then raise exception 'Request conflict'; end if;
  return result;
 end if;
 select count(*),coalesce(sum(case when type='earn' then amount else -amount end),0) into n,balance from public.store_credit_ledger where member_id=p_member;
 if n=0 then raise exception 'No ledger entries'; end if;
 insert into public.credit_reconciliations(id,member_id,actor_id,ledger_count,ledger_balance,note) values(p_request,p_member,auth.uid(),n,balance,trim(p_note)) returning * into result;
 insert into public.operation_logs(actor_id,action,details) values(auth.uid(),'credit_reconciled',jsonb_build_object('member_id',p_member,'reconciliation_id',p_request,'ledger_count',n,'ledger_balance',balance));
 return result;
end $$;
revoke all on function public.reconcile_credit(uuid,uuid,text) from public,anon;
grant execute on function public.reconcile_credit(uuid,uuid,text) to authenticated;
commit;


-- ==== 20260920000003_journal_articles.sql ====

begin;
create table if not exists public.journal_articles (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 150),
 kicker text not null default '香誌' check(length(kicker)<=80),
 excerpt text not null default '' check(length(excerpt)<=500),
 body text not null check(length(trim(body)) between 1 and 50000),
 author text not null default 'ENSO 編輯室' check(length(author) between 1 and 80),
 kanji text not null default '香' check(length(kanji) between 1 and 2),
 cover text check(cover is null or cover ~ '^https://' or (cover ~ '^/images/' and cover !~ '^//')),
 read_minutes integer not null default 3 check(read_minutes between 1 and 120),
 status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.journal_articles enable row level security;
revoke all on public.journal_articles from anon,authenticated;
grant select on public.journal_articles to anon,authenticated;
grant insert,update,delete on public.journal_articles to authenticated;
grant all on public.journal_articles to service_role;
drop policy if exists journal_public_read on public.journal_articles;
create policy journal_public_read on public.journal_articles for select
 using(status='published' and published_at<=now());
drop policy if exists journal_staff_manage on public.journal_articles;
create policy journal_staff_manage on public.journal_articles for all to authenticated
 using(public.current_role() in ('marketing','admin')) with check(public.current_role() in ('marketing','admin'));

create or replace function public.stamp_journal_article() returns trigger
language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid();new.created_at:=now();
 else new.created_by:=old.created_by;new.created_at:=old.created_at; end if;
 new.updated_at:=now();
 if new.status='draft' then new.published_at:=null;
 elsif tg_op='INSERT' then new.published_at:=now();
 elsif old.status<>'published' then new.published_at:=now();
 else new.published_at:=old.published_at; end if;
 return new;
end $$;
drop trigger if exists stamp_journal_article on public.journal_articles;
create trigger stamp_journal_article before insert or update on public.journal_articles
 for each row execute function public.stamp_journal_article();
create or replace function public.audit_journal_article() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.operation_logs(actor_id,action,details) values(auth.uid(),'article_'||lower(tg_op),
 jsonb_build_object('article_id',case when tg_op='DELETE' then old.id else new.id end));
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
drop trigger if exists audit_journal_article on public.journal_articles;
create trigger audit_journal_article after insert or update or delete on public.journal_articles
 for each row execute function public.audit_journal_article();
commit;


-- ==== 20260920000004_referral_reward_campaigns.sql ====

begin;
-- These rewards credit the referrer. They do not discount the buyer's cart.
create table if not exists public.referral_reward_campaigns(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 120),
 reward_type text not null check(reward_type in ('fixed','percent')),reward_value numeric not null,
 priority integer not null default 0,is_active boolean not null default true,
 starts_at timestamptz not null,ends_at timestamptz not null,
 referrer_ids uuid[] not null default '{}',created_at timestamptz not null default now(),
 check(ends_at>starts_at),check(reward_value>0 and ((reward_type='percent' and reward_value<=100) or (reward_type='fixed' and reward_value<=1000000 and reward_value=trunc(reward_value))))
);
alter table public.referral_reward_campaigns enable row level security;
grant select,insert,update on public.referral_reward_campaigns to authenticated;
grant all on public.referral_reward_campaigns to service_role;
drop policy if exists referral_reward_campaigns_read on public.referral_reward_campaigns;
create policy referral_reward_campaigns_read on public.referral_reward_campaigns for select using(public.current_role() in ('admin','finance'));
drop policy if exists referral_reward_campaigns_insert on public.referral_reward_campaigns;
create policy referral_reward_campaigns_insert on public.referral_reward_campaigns for insert with check(public.current_role()='admin');
drop policy if exists referral_reward_campaigns_update on public.referral_reward_campaigns;
create policy referral_reward_campaigns_update on public.referral_reward_campaigns for update using(public.current_role()='admin') with check(public.current_role()='admin');
create table if not exists public.referral_reward_snapshots(
 order_id uuid primary key references public.orders(id),referrer_id uuid not null references public.profiles(id),
 campaign_id uuid not null references public.referral_reward_campaigns(id),campaign_name text not null,
 reward_type text not null,reward_value numeric not null,base_credit integer not null,bonus_credit integer not null check(bonus_credit>=0),
 subtotal integer not null,created_at timestamptz not null default now()
);
alter table public.referral_reward_snapshots enable row level security;
grant select on public.referral_reward_snapshots to authenticated;
grant all on public.referral_reward_snapshots to service_role;
drop policy if exists referral_reward_snapshots_read on public.referral_reward_snapshots;
create policy referral_reward_snapshots_read on public.referral_reward_snapshots for select using(public.current_role() in ('admin','finance') or referrer_id=auth.uid());
create or replace function public.settle_ecpay_payment(
  p_merchant_trade_no text, p_gateway_trade_no text, p_amount integer,
  p_payment_type text, p_paid boolean, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tx public.payment_transactions%rowtype;
  ord public.orders%rowtype;
  tier text;
  rate numeric;
  credit integer := 0;
  existing_credit integer;
  reward public.referral_reward_campaigns%rowtype;
  bonus integer := 0;
  base_credit integer := 0;
  stamp timestamptz := now();
begin
  -- Serialize distinct payment attempts for the same order as well as repeats.
  select * into tx from public.payment_transactions where merchant_trade_no=p_merchant_trade_no;
  if not found then raise exception 'Payment transaction not found'; end if;
  select * into ord from public.orders where id=tx.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select * into tx from public.payment_transactions where id=tx.id for update;
  if tx.provider <> 'ecpay' then raise exception 'Invalid provider'; end if;
  if p_amount is null or p_amount < 1 or p_amount <> tx.amount or p_amount <> ord.total then
    raise exception 'Amount mismatch';
  end if;
  if p_paid is null then raise exception 'Missing payment result'; end if;
  if not p_paid then
    update public.payment_transactions set status='failed', raw_notify=p_payload,
      gateway_trade_no=nullif(p_gateway_trade_no,''), payment_type=p_payment_type
      where id=tx.id and status <> 'paid';
    return jsonb_build_object('outcome','failed','order',to_jsonb(ord),'credit',0);
  end if;
  if coalesce(p_gateway_trade_no,'')='' then raise exception 'Missing gateway trade number'; end if;
  if tx.gateway_trade_no is not null and tx.status='paid' and tx.gateway_trade_no <> p_gateway_trade_no then
    raise exception 'Gateway trade number mismatch';
  end if;
  if tx.settled_at is not null then
    return jsonb_build_object('outcome','duplicate','order',to_jsonb(ord),'credit',0);
  end if;

  update public.payment_transactions set status='paid', gateway_trade_no=p_gateway_trade_no,
    payment_type=p_payment_type, paid_at=coalesce(paid_at,stamp), raw_notify=p_payload,
    settled_at=stamp, settlement_outcome='settled' where id=tx.id;

  -- Preserve cancelled/refunded orders and record a second charge for reconciliation.
  if ord.status in ('cancelled','refunded') or
    (ord.payment_gateway_trade_no is not null and ord.payment_gateway_trade_no <> p_gateway_trade_no) then
    update public.payment_transactions set settlement_outcome='review_required' where id=tx.id;
    return jsonb_build_object('outcome','review_required','order',to_jsonb(ord),'credit',0);
  end if;

  update public.orders set
    status=case when status in ('shipped','completed') then status else 'paid'::public.order_status end,
    paid_at=coalesce(paid_at,stamp),
    payment_method=p_payment_type, payment_gateway_trade_no=p_gateway_trade_no
    where id=ord.id returning * into ord;

  select amount into existing_credit from public.store_credit_ledger
    where order_id=ord.id and type='earn' limit 1;
  if existing_credit is null and ord.referrer_id is not null then
    tier := ord.referrer_tier_snapshot;
    if tier is null then select member_tier::text into tier from public.profiles where id=ord.referrer_id; end if;
    if tier='normal' then
      select (value #>> '{}')::numeric into rate from public.app_settings where key='referral_cashback_rate';
      rate := coalesce(rate,0);
      if rate < 0 or rate > 100 then raise exception 'Invalid referral rate'; end if;
      credit := round(ord.subtotal * rate / 100);
      base_credit := credit;
      -- Exactly one highest-priority reward at payment time; the snapshot is immutable.
      select * into reward from public.referral_reward_campaigns where is_active
        and starts_at<=stamp and stamp<ends_at
        and (cardinality(referrer_ids)=0 or ord.referrer_id=any(referrer_ids))
        order by priority desc,created_at,id limit 1;
      if found then
        bonus := case when reward.reward_type='fixed' then reward.reward_value::integer else round(ord.subtotal * reward.reward_value / 100)::integer end;
        credit := credit + bonus;
        insert into public.referral_reward_snapshots(order_id,referrer_id,campaign_id,campaign_name,reward_type,reward_value,base_credit,bonus_credit,subtotal)
          values(ord.id,ord.referrer_id,reward.id,reward.name,reward.reward_type,reward.reward_value,base_credit,bonus,ord.subtotal);
      end if;
      if credit > 0 then
        insert into public.store_credit_ledger(member_id,type,amount,order_id,created_at,expires_at)
          values(ord.referrer_id,'earn',credit,ord.id,stamp,stamp+interval '365 days');
      end if;
    end if;
  end if;
  return jsonb_build_object('outcome','settled','order',to_jsonb(ord),'credit',credit);
end;
$$;
revoke all on function public.settle_ecpay_payment(text,text,integer,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.settle_ecpay_payment(text,text,integer,text,boolean,jsonb) to service_role;
commit;
