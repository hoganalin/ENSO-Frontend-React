-- 20261111000003_apply_store_credit_server.sql
-- F1 修復：購物金折抵改為「伺服器端套用」。
--   1. orders 新增 credit_used（折抵金額；下單時為「預留」，不立即寫 ledger）。
--   2. create_checkout_order：伺服器端驗餘額、扣掉其他未付訂單的預留、夾限後寫入 credit_used，
--      並把 total 改為 subtotal - discount + shipping - credit_used。不在此寫 ledger。
--   3. settle_ecpay_payment：付款結算成功時，才原子寫入買家的 'spend' ledger（含冪等）。
--      未付的 pending 訂單不產生 ledger，放棄即自動釋放購物金。
--   4. guard_checkout_order：把 credit_used 納入不可變欄位。
-- 可重複執行。
begin;

alter table public.orders
  add column if not exists credit_used integer not null default 0;

-- ---------- create_checkout_order：改為 5 參數（多 p_credit_requested）----------
drop function if exists public.create_checkout_order(uuid,jsonb,jsonb,jsonb);
create or replace function public.create_checkout_order(
  p_buyer_id uuid, p_request jsonb, p_items jsonb, p_totals jsonb, p_credit_requested integer default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_subtotal bigint := 0;
  v_discount integer := (p_totals->>'discount')::integer;
  v_shipping integer := (p_totals->>'shippingFee')::integer;
  v_base_total integer := (p_totals->>'total')::integer;
  v_request_id uuid := (p_request->>'requestId')::uuid;
  v_referrer_tier public.member_tier;
  v_balance bigint := 0;
  v_reserved bigint := 0;
  v_available bigint := 0;
  v_credit integer := 0;
  v_final_total integer;
begin
  if p_buyer_id is null or v_request_id is null then raise exception 'Missing buyer or request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_buyer_id::text || v_request_id::text, 0));
  select * into v_order from public.orders
    where buyer_id = p_buyer_id and checkout_request_id = v_request_id;
  if found then
    if v_order.checkout_request is distinct from p_request then raise exception 'Request key reused with different content'; end if;
    return to_jsonb(v_order);
  end if;
  -- 鎖住買家本人這列，讓同一買家的併發結帳序列化（購物金預留讀改寫才安全）。
  select * into strict v_profile from public.profiles where id = p_buyer_id for update;
  if v_profile.referrer_id is not null then
    select member_tier into v_referrer_tier from public.profiles where id = v_profile.referrer_id;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 100 then raise exception 'Invalid items'; end if;
  if jsonb_typeof(p_request->'recipient') is distinct from 'object' then raise exception 'Missing recipient'; end if;
  if coalesce(length(trim(p_request->'recipient'->>'name')),0) = 0
    or coalesce(length(trim(p_request->'recipient'->>'tel')),0) = 0
    or coalesce(length(trim(p_request->'recipient'->>'email')),0) = 0
    or coalesce(length(trim(p_request->'recipient'->>'address')),0) < 6 then raise exception 'Invalid recipient'; end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    select * into v_product from public.products where id = (v_item->>'productId')::uuid for share;
    if not found then raise exception 'Product missing'; end if;
    if not v_product.is_enabled or v_product.price is distinct from (v_item->>'unitPrice')::integer
      or (v_item->>'qty')::integer not between 1 and 999 then raise exception 'Product changed'; end if;
    v_subtotal := v_subtotal + v_product.price::bigint * (v_item->>'qty')::integer;
  end loop;
  if v_subtotal is distinct from (p_totals->>'subtotal')::bigint
    or v_discount is null or v_discount < 0 or v_discount > v_subtotal
    or v_shipping is null or v_shipping not in (0,80)
    or v_base_total is null or v_base_total < 1 or v_base_total <> v_subtotal - v_discount + v_shipping
    then raise exception 'Invalid totals'; end if;
  -- 購物金預留：可用額度 = ledger 餘額 - 其他 pending 訂單已預留的 credit_used。
  -- spend ledger 只在付款結算時才寫（見 settle_ecpay_payment），故放棄未付訂單會自動釋放。
  select coalesce(sum(case when type = 'earn' then amount else -amount end), 0)
    into v_balance from public.store_credit_ledger where member_id = p_buyer_id;
  select coalesce(sum(credit_used), 0) into v_reserved
    from public.orders where buyer_id = p_buyer_id and status = 'pending';
  v_available := v_balance - v_reserved;
  v_credit := greatest(coalesce(p_credit_requested, 0), 0);
  if v_credit > v_base_total - 1 then v_credit := greatest(v_base_total - 1, 0); end if;  -- 至少保留 NT$1 給金流收款
  if v_credit > v_available then v_credit := greatest(v_available, 0)::integer; end if;
  v_final_total := v_base_total - v_credit;
  insert into public.orders(buyer_id, referrer_id, referrer_tier_snapshot,
    subtotal, discount, shipping_fee, total, credit_used, status, recipient, applied_promos,
    checkout_source, checkout_request_id, checkout_request)
  values(p_buyer_id, v_profile.referrer_id, v_referrer_tier, v_subtotal, v_discount,
    v_shipping, v_final_total, v_credit, 'pending', p_request->'recipient', p_totals->'appliedPromos',
    'server-v1', v_request_id, p_request) returning * into v_order;
  insert into public.order_items(order_id, product_id, title, unit_price, qty)
  select v_order.id, (item->>'productId')::uuid, item->>'title',
    (item->>'unitPrice')::integer, (item->>'qty')::integer from jsonb_array_elements(p_items) item;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.create_checkout_order(uuid,jsonb,jsonb,jsonb,integer) from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid,jsonb,jsonb,jsonb,integer) to service_role;

-- ---------- guard_checkout_order：credit_used 納入不可變 ----------
create or replace function public.guard_checkout_order() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' then
    if old.checkout_source = 'server-v1' then raise exception 'Server checkout cannot be deleted from client'; end if;
    return old;
  end if;
  if new.checkout_source is distinct from old.checkout_source
    or new.checkout_request_id is distinct from old.checkout_request_id
    or new.checkout_request is distinct from old.checkout_request then raise exception 'Checkout metadata is immutable'; end if;
  if old.checkout_source = 'server-v1' and (
    row(new.buyer_id,new.referrer_id,new.referrer_tier_snapshot,new.subtotal,new.discount,new.shipping_fee,new.total,new.credit_used,new.applied_promos,
      new.status,new.paid_at,new.completed_at,new.payment_method,new.payment_gateway_trade_no)
    is distinct from
    row(old.buyer_id,old.referrer_id,old.referrer_tier_snapshot,old.subtotal,old.discount,old.shipping_fee,old.total,old.credit_used,old.applied_promos,
      old.status,old.paid_at,old.completed_at,old.payment_method,old.payment_gateway_trade_no)
  ) then raise exception 'Checkout amounts and payment state are server-managed'; end if;
  return new;
end;
$$;

-- ---------- settle_ecpay_payment：結算成功時寫入買家 spend（冪等）；推薦回饋基準改用 subtotal-discount ----------
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
  reward_subtotal integer;
  stamp timestamptz := now();
begin
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

  -- 買家購物金折抵：結算成功才寫 spend（冪等；pending 未付訂單不產生此列）。
  if ord.credit_used > 0 and not exists(
      select 1 from public.store_credit_ledger where order_id=ord.id and type='spend') then
    insert into public.store_credit_ledger(member_id,type,amount,order_id,created_at)
      values(ord.buyer_id,'spend',ord.credit_used,ord.id,stamp);
  end if;

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
    if rate > 0 then
      if rate > 100 then raise exception 'Invalid referral rate'; end if;
      -- 推薦回饋基準 = 商品淨額（subtotal - discount），不受買家購物金折抵影響。
      reward_subtotal := greatest(0, ord.subtotal - ord.discount);
      credit := round(reward_subtotal * rate / 100);
      base_credit := credit;
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
