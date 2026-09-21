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

