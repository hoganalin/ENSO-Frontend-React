-- 親送運費規則：未達 NT$3,000 收 150，滿 3,000 免運。
-- (1) 重定義 create_checkout_order：允許的運費從 (0,80) 改為 (0,150)。
--     與前端/後端 SHIPPING_BASE=150 一致；body 與 007 版逐字相同，只改這一處。
-- (2) 新增「滿 3,000 免運」促銷（group=shipping, free_ship）。
begin;

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
    or v_shipping is null or v_shipping not in (0,150)
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

-- (2) 滿 3,000 免運（自動、不限期）。idempotent：同名已存在就不重插。
insert into public.promotions (name, kind, promo_group, priority, is_auto, is_active, conditions, effect)
select '滿 NT$3,000 免運', '滿額免運', 'shipping', 20, true, true,
       '{"min_subtotal": 3000}'::jsonb, '{"free_ship": true}'::jsonb
where not exists (select 1 from public.promotions where name = '滿 NT$3,000 免運');

commit;
