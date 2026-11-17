-- 20261114000002_fix_checkout_shipping_base.sql
-- 既有 bug 修正：SHIPPING_BASE 已改為 150，但 create_checkout_order 仍寫死運費只接受 (0,80)，
-- 導致標準運費(150)的訂單建單被 'Invalid totals' 擋下。此處重發函式，運費檢查改為 (0,150)。
-- 本函式其餘內容與 20261111000003 相同（含購物金 credit_used 預留邏輯）。
begin;

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
    or v_shipping is null or v_shipping not in (0,150)
    or v_base_total is null or v_base_total < 1 or v_base_total <> v_subtotal - v_discount + v_shipping
    then raise exception 'Invalid totals'; end if;
  select coalesce(sum(case when type = 'earn' then amount else -amount end), 0)
    into v_balance from public.store_credit_ledger where member_id = p_buyer_id;
  select coalesce(sum(credit_used), 0) into v_reserved
    from public.orders where buyer_id = p_buyer_id and status = 'pending';
  v_available := v_balance - v_reserved;
  v_credit := greatest(coalesce(p_credit_requested, 0), 0);
  if v_credit > v_base_total - 1 then v_credit := greatest(v_base_total - 1, 0); end if;
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

commit;
