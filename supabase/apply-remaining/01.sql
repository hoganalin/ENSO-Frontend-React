-- ============================================================
-- ENSO 待補 migration · 第 1/7 段 
-- 內含 3 支 migration，每支自帶 begin/commit，可安全重複執行
-- 在 Supabase SQL Editor 整段貼上按 Run；若出錯，修好後原樣重跑即可
-- ============================================================


-- ==== 20260917000007_trusted_checkout.sql ====

-- Apply after 001–006, before deploying checkout-create and the new frontend.
-- Only checkout-create (service_role) may create orders. Existing orders are retained.
begin;
alter table public.orders
  add column if not exists checkout_source text,
  add column if not exists checkout_request_id uuid,
  add column if not exists checkout_request jsonb;
create unique index if not exists orders_checkout_request
  on public.orders(buyer_id, checkout_request_id) where checkout_request_id is not null;

drop policy if exists orders_insert on public.orders;
drop policy if exists items_insert on public.order_items;
revoke insert on public.orders, public.order_items from anon, authenticated;

create or replace function public.create_checkout_order(
  p_buyer_id uuid, p_request jsonb, p_items jsonb, p_totals jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_profile public.profiles%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_subtotal bigint := 0;
  v_discount integer := (p_totals->>'discount')::integer;
  v_shipping integer := (p_totals->>'shippingFee')::integer;
  v_total integer := (p_totals->>'total')::integer;
  v_request_id uuid := (p_request->>'requestId')::uuid;
  v_referrer_tier public.member_tier;
begin
  if p_buyer_id is null or v_request_id is null then raise exception 'Missing buyer or request'; end if;
  -- Serialize identical requests, including two concurrent HTTP retries.
  perform pg_advisory_xact_lock(hashtextextended(p_buyer_id::text || v_request_id::text, 0));
  select * into v_order from public.orders
    where buyer_id = p_buyer_id and checkout_request_id = v_request_id;
  if found then
    if v_order.checkout_request is distinct from p_request then raise exception 'Request key reused with different content'; end if;
    return to_jsonb(v_order);
  end if;
  select * into strict v_profile from public.profiles where id = p_buyer_id for share;
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
  -- Stable lock order; recheck prices/enabled flags inside the transaction.
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
    or v_total is null or v_total < 1 or v_total <> v_subtotal - v_discount + v_shipping
    then raise exception 'Invalid totals'; end if;
  insert into public.orders(buyer_id, referrer_id, referrer_tier_snapshot,
    subtotal, discount, shipping_fee, total, status, recipient, applied_promos,
    checkout_source, checkout_request_id, checkout_request)
  values(p_buyer_id, v_profile.referrer_id, v_referrer_tier, v_subtotal, v_discount,
    v_shipping, v_total, 'pending', p_request->'recipient', p_totals->'appliedPromos',
    'server-v1', v_request_id, p_request) returning * into v_order;
  insert into public.order_items(order_id, product_id, title, unit_price, qty)
  select v_order.id, (item->>'productId')::uuid, item->>'title',
    (item->>'unitPrice')::integer, (item->>'qty')::integer from jsonb_array_elements(p_items) item;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.create_checkout_order(uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid,jsonb,jsonb,jsonb) to service_role;

-- Staff can view orders and edit recipient details, but cannot rewrite the
-- trusted quote or mark a server checkout as paid from a browser.
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
    row(new.buyer_id,new.referrer_id,new.referrer_tier_snapshot,new.subtotal,new.discount,new.shipping_fee,new.total,new.applied_promos,
      new.status,new.paid_at,new.completed_at,new.payment_method,new.payment_gateway_trade_no)
    is distinct from
    row(old.buyer_id,old.referrer_id,old.referrer_tier_snapshot,old.subtotal,old.discount,old.shipping_fee,old.total,old.applied_promos,
      old.status,old.paid_at,old.completed_at,old.payment_method,old.payment_gateway_trade_no)
  ) then raise exception 'Checkout amounts and payment state are server-managed'; end if;
  return new;
end;
$$;
drop trigger if exists guard_checkout_order on public.orders;
create trigger guard_checkout_order before update or delete on public.orders
  for each row execute function public.guard_checkout_order();

create or replace function public.guard_checkout_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if exists(select 1 from public.orders where id = old.order_id and checkout_source = 'server-v1') then
      raise exception 'Checkout items are server-managed';
    end if;
    if tg_op = 'UPDATE' then
      if exists(select 1 from public.orders where id = new.order_id and checkout_source = 'server-v1') then
        raise exception 'Checkout items are server-managed';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists guard_checkout_item on public.order_items;
create trigger guard_checkout_item before update or delete on public.order_items
  for each row execute function public.guard_checkout_item();
commit;


-- ==== 20260917000008_atomic_payment_settlement.sql ====

-- Apply after 007. Only the signature-verifying Edge Function may call this RPC.
begin;
alter table public.payment_transactions add column if not exists settled_at timestamptz;
alter table public.payment_transactions add column if not exists settlement_outcome text;

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


-- ==== 20260917000009_delivery_jobs.sql ====

begin;
create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  kind text not null check(kind in ('buyer_sms','referrer_sms','invoice')),
  status text not null default 'pending' check(status in ('pending','processing','sending','succeeded','failed','uncertain')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,kind)
);
alter table public.delivery_jobs enable row level security;
revoke all on public.delivery_jobs from anon,authenticated;
grant select on public.delivery_jobs to authenticated;
grant all on public.delivery_jobs to service_role;
drop policy if exists delivery_jobs_read on public.delivery_jobs;
create policy delivery_jobs_read on public.delivery_jobs for select
  using(public.current_role() in ('support','finance','admin'));

create or replace function public.enqueue_order_delivery() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.payment_gateway_trade_no is not null and old.payment_gateway_trade_no is null
    and new.status in ('paid','shipped','completed') then
    insert into public.delivery_jobs(order_id,kind) values(new.id,'buyer_sms'),(new.id,'invoice') on conflict do nothing;
    if new.referrer_id is not null then
      insert into public.delivery_jobs(order_id,kind) values(new.id,'referrer_sms') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enqueue_order_delivery on public.orders;
create trigger enqueue_order_delivery after update on public.orders
  for each row execute function public.enqueue_order_delivery();

create or replace function public.claim_delivery_jobs(p_limit integer default 10)
returns setof public.delivery_jobs language plpgsql security definer set search_path=public as $$
begin
  -- A crashed worker before sending is retryable; after sending, the result is unknown.
  update public.delivery_jobs set status=case when status='sending' then 'uncertain' else 'failed' end,
    last_error='Worker lease expired; reconcile unknown sends before retry', lease_token=null,lease_until=null,updated_at=now()
    where status in ('processing','sending') and lease_until < now();
  return query with picked as (
    select id from public.delivery_jobs where status in ('pending','failed') and attempts < 5
      and next_attempt_at <= now() order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,10),20))
  ) update public.delivery_jobs j set status='processing',attempts=j.attempts+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '5 minutes',updated_at=now() from picked where j.id=picked.id returning j.*;
end;
$$;

create or replace function public.transition_delivery_job(p_id uuid,p_token uuid,p_status text,p_error text default null,p_reference text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if p_status not in ('sending','succeeded','failed','uncertain') then raise exception 'Invalid job status'; end if;
  update public.delivery_jobs set status=p_status,last_error=left(p_error,1000),provider_reference=coalesce(p_reference,provider_reference),
    next_attempt_at=now()+interval '5 minutes',updated_at=now(),
    lease_until=case when p_status='sending' then now()+interval '5 minutes' else null end,
    lease_token=case when p_status='sending' then lease_token else null end
    where id=p_id and lease_token=p_token and lease_until>now()
      and ((status='processing' and p_status in ('sending','failed','succeeded'))
        or (status='sending' and p_status in ('succeeded','failed','uncertain')));
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function public.claim_delivery_jobs(integer) from public,anon,authenticated;
revoke all on function public.transition_delivery_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_delivery_jobs(integer) to service_role;
grant execute on function public.transition_delivery_job(uuid,uuid,text,text,text) to service_role;
commit;
