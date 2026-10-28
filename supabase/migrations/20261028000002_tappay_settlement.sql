-- TapPay settlement: reuse the existing settlement function for TapPay too.
-- Body is IDENTICAL to 20260929000002_net_referral_rewards.sql's settle_ecpay_payment;
-- the ONLY change is the provider guard, relaxed from ('ecpay') to ('ecpay','tappay'),
-- so both the ECPay notify handler and the TapPay pay function share one settler
-- (single source of truth for order status, referral cashback and reward campaigns).
begin;
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
  reward_subtotal integer; -- Net merchandise amount; excludes shipping and buyer discount.
  stamp timestamptz := now();
begin
  -- Serialize distinct payment attempts for the same order as well as repeats.
  select * into tx from public.payment_transactions where merchant_trade_no=p_merchant_trade_no;
  if not found then raise exception 'Payment transaction not found'; end if;
  select * into ord from public.orders where id=tx.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select * into tx from public.payment_transactions where id=tx.id for update;
  if tx.provider not in ('ecpay','tappay') then raise exception 'Invalid provider'; end if;
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
    if tier='silver' then
      select (value #>> '{}')::numeric into rate from public.app_settings where key='silver_cashback_rate';
      rate := coalesce(rate,10);
    elsif tier='gold' then
      select (value #>> '{}')::numeric into rate from public.app_settings where key='gold_cashback_rate';
      rate := coalesce(rate,20);
    end if;
    -- normal 會員不發回饋金，只有 silver(10%) / gold(20%) 才發
    if rate > 0 then
      if rate > 100 then raise exception 'Invalid referral rate'; end if;
      reward_subtotal := greatest(0, ord.total - ord.shipping_fee);
      credit := round(reward_subtotal * rate / 100);
      base_credit := credit;
      -- Exactly one highest-priority reward at payment time; the snapshot is immutable.
      select * into reward from public.referral_reward_campaigns where is_active
        and starts_at<=stamp and stamp<ends_at
        and (cardinality(referrer_ids)=0 or ord.referrer_id=any(referrer_ids))
        order by priority desc,created_at,id limit 1;
      if found then
        bonus := case when reward.reward_type='fixed' then reward.reward_value::integer else round(reward_subtotal * reward.reward_value / 100)::integer end;
        credit := credit + bonus;
        insert into public.referral_reward_snapshots(order_id,referrer_id,campaign_id,campaign_name,reward_type,reward_value,base_credit,bonus_credit,subtotal)
          values(ord.id,ord.referrer_id,reward.id,reward.name,reward.reward_type,reward.reward_value,base_credit,bonus,reward_subtotal);
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
