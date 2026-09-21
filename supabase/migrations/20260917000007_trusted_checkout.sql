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
