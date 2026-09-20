-- ============================================================
-- ENSO 待補 migration · 第 2/7 段 
-- 內含 7 支 migration，每支自帶 begin/commit，可安全重複執行
-- 在 Supabase SQL Editor 整段貼上按 Run；若出錯，修好後原樣重跑即可
-- ============================================================


-- ==== 20260917000010_order_operations.sql ====

begin;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;
create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
  action text not null, order_id uuid references public.orders(id), details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.operation_logs enable row level security;
grant select on public.operation_logs to authenticated;
grant all on public.operation_logs to service_role;
drop policy if exists operation_logs_read on public.operation_logs;
create policy operation_logs_read on public.operation_logs for select using(public.current_role() in ('finance','admin'));

create or replace function public.admin_order_action(p_actor uuid,p_order uuid,p_action text,p_recipient jsonb default null,p_tracking text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; ord public.orders%rowtype; item record; product public.products%rowtype;
begin
  select role::text into actor from public.profiles where id=p_actor for share;
  if actor is null then raise exception 'Unauthorized'; end if;
  if (p_action in ('update_recipient','cancel') and actor not in ('support','admin'))
    or (p_action in ('ship','complete') and actor not in ('warehouse','admin'))
    or p_action not in ('update_recipient','cancel','ship','complete') or p_action is null then
    raise exception 'Forbidden action';
  end if;
  select * into ord from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action='update_recipient' then
    if ord.status not in ('pending','paid') then raise exception 'Recipient is locked after shipping'; end if;
    if jsonb_typeof(p_recipient) is distinct from 'object' or coalesce(length(trim(p_recipient->>'name')),0)<1
      or coalesce(length(trim(p_recipient->>'address')),0)<6
      or coalesce(p_recipient->>'tel','') !~ '^(09[0-9]{8}|\+8869[0-9]{8})$'
      or coalesce(p_recipient->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid recipient'; end if;
    update public.orders set recipient=p_recipient where id=p_order;
  elsif p_action='cancel' then
    if ord.status <> 'pending' then raise exception 'Only unpaid orders can be cancelled'; end if;
    update public.orders set status='cancelled' where id=p_order;
  elsif p_action='ship' then
    if ord.status='shipped' and ord.tracking_number=p_tracking then return to_jsonb(ord); end if;
    if ord.status <> 'paid' then raise exception 'Only paid orders can ship'; end if;
    if coalesce(length(trim(p_tracking)),0) not between 1 and 100 then raise exception 'Tracking number required'; end if;
    if not exists(select 1 from public.order_items where order_id=p_order) then raise exception 'Order items missing'; end if;
    for item in select product_id,sum(qty)::integer qty from public.order_items where order_id=p_order group by product_id order by product_id loop
      select * into product from public.products where id=item.product_id for update;
      if not found or product.inventory < item.qty or item.qty<1 then raise exception 'Insufficient inventory'; end if;
      update public.products set inventory=inventory-item.qty where id=product.id;
      insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id)
        values(product.id,product.title,'subtract',item.qty,product.inventory,product.inventory-item.qty,'出貨 '||ord.order_no,p_actor);
    end loop;
    update public.orders set status='shipped',tracking_number=trim(p_tracking),shipped_at=now() where id=p_order;
  elsif p_action='complete' then
    if ord.status='completed' then return to_jsonb(ord); end if;
    if ord.status <> 'shipped' then raise exception 'Only shipped orders can complete'; end if;
    update public.orders set status='completed',completed_at=now() where id=p_order;
  end if;
  insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,p_action,p_order,jsonb_build_object('previous_status',ord.status,'tracking_number',p_tracking));
  select * into ord from public.orders where id=p_order;
  return to_jsonb(ord);
end;
$$;
revoke all on function public.admin_order_action(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_order_action(uuid,uuid,text,jsonb,text) to service_role;
-- All order changes now go through the audited, role-checked server operation.
revoke update,delete on public.orders from anon,authenticated;
revoke update,delete on public.order_items from anon,authenticated;
commit;


-- ==== 20260917000011_inventory_adjustment.sql ====

begin;
create or replace function public.adjust_inventory(p_product uuid,p_delta integer,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); role_name text; product public.products%rowtype; after_qty bigint;
begin
  select role::text into role_name from public.profiles where id=actor for share;
  if role_name is null or role_name not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
  if p_delta is null or p_delta=0 or abs(p_delta::bigint)>1000000 or coalesce(length(trim(p_note)),0) not between 1 and 500 then raise exception 'Invalid adjustment'; end if;
  select * into product from public.products where id=p_product for update;
  if not found then raise exception 'Product not found'; end if;
  after_qty := product.inventory::bigint+p_delta;
  if after_qty < 0 or after_qty>2147483647 then raise exception 'Invalid stock balance'; end if;
  update public.products set inventory=after_qty where id=p_product;
  insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id)
    values(p_product,product.title,case when p_delta>0 then 'add'::public.inventory_tx_type else 'subtract'::public.inventory_tx_type end,
      abs(p_delta),product.inventory,after_qty,trim(p_note),actor);
  return jsonb_build_object('inventory',after_qty);
end;
$$;
revoke all on function public.adjust_inventory(uuid,integer,text) from public,anon;
grant execute on function public.adjust_inventory(uuid,integer,text) to authenticated;
-- History must be written by an atomic stock operation, not independently by a browser.
revoke insert,update,delete on public.inventory_logs from anon,authenticated;
commit;


-- ==== 20260917000012_referral_access.sql ====

begin;
create or replace function public.can_view_referrals() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select role='referral_partner' or member_tier in ('silver','gold') from public.profiles where id=auth.uid()),false)
$$;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (
  buyer_id=auth.uid() or public.is_staff() or
  (public.can_view_referrals() and referrer_id=auth.uid())
);
drop policy if exists items_read on public.order_items;
create policy items_read on public.order_items for select using (
  exists(select 1 from public.orders o where o.id=order_id and
    (o.buyer_id=auth.uid() or public.is_staff() or (public.can_view_referrals() and o.referrer_id=auth.uid())))
);
commit;


-- ==== 20260917000013_subscriptions_distributor_refunds.sql ====

begin;
-- Business rules are data, so unfinished commercial policies stay disabled by default.
alter table public.profiles add column if not exists distributor_discount_rate numeric not null default 0 check(distributor_discount_rate between 0 and 100);
alter table public.profiles add column if not exists subscription_active boolean not null default false;
alter table public.profiles add column if not exists subscription_started_at timestamptz;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;

create table if not exists public.refund_requests (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
 requested_by uuid not null references public.profiles(id), amount integer not null check(amount>0),
 reason text not null check(length(trim(reason)) between 1 and 1000), status text not null default 'requested'
   check(status in ('requested','approved','processing','succeeded','failed','uncertain','rejected')),
 provider_reference text, last_error text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.refund_requests enable row level security;
grant select on public.refund_requests to authenticated;
grant all on public.refund_requests to service_role;
drop policy if exists refund_requests_read on public.refund_requests;
create policy refund_requests_read on public.refund_requests for select using(public.current_role() in ('support','finance','admin') or requested_by=auth.uid());

create or replace function public.request_refund(p_order uuid,p_amount integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); ord public.orders%rowtype; existing public.refund_requests%rowtype;
begin
 select * into ord from public.orders where id=p_order and buyer_id=actor for share;
 if not found then raise exception 'Order not found'; end if;
 if ord.status not in ('paid','shipped','completed') then raise exception 'Order cannot be refunded'; end if;
 if p_amount is null or p_amount<1 or p_amount>ord.total or coalesce(length(trim(p_reason)),0)>1000 then raise exception 'Invalid refund'; end if;
 select * into existing from public.refund_requests where order_id=p_order;
 if found then return to_jsonb(existing); end if;
 insert into public.refund_requests(order_id,requested_by,amount,reason) values(p_order,actor,p_amount,trim(p_reason)) returning * into existing;
 return to_jsonb(existing);
end;
$$;
revoke all on function public.request_refund(uuid,integer,text) from public,anon;
grant execute on function public.request_refund(uuid,integer,text) to authenticated;

create or replace function public.set_refund_status(p_refund uuid,p_status text,p_provider_reference text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); role_name text; row public.refund_requests%rowtype;
begin
 select role::text into role_name from public.profiles where id=actor;
 if role_name not in ('finance','admin') then raise exception 'Forbidden'; end if;
 if p_status not in ('approved','processing','succeeded','failed','uncertain','rejected') then raise exception 'Invalid status'; end if;
 update public.refund_requests set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),last_error=left(p_error,1000),reviewed_by=actor,reviewed_at=now(),updated_at=now() where id=p_refund returning * into row;
 if not found then raise exception 'Refund not found'; end if;
 insert into public.operation_logs(actor_id,action,order_id,details) values(actor,'refund_'||p_status,row.order_id,jsonb_build_object('amount',row.amount,'provider_reference',p_provider_reference));
 return to_jsonb(row);
end;
$$;
revoke all on function public.set_refund_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.set_refund_status(uuid,text,text,text) to service_role;
commit;


-- ==== 20260918000001_seed_demo_catalog.sql ====

-- ENSO demo catalog for the shared test project.
-- Keep this idempotent so re-running deployments does not duplicate rows.
insert into public.products (title, category, price, unit, description, top_smell, heart_smell, base_smell, inventory)
select v.title, v.category, v.price, v.unit, v.description, v.top_smell, v.heart_smell, v.base_smell, v.inventory
from (values
  ('芽莊沈香 · 臥香', '沈香', 1280, '盒', '頂級芽莊沈香，沉靜悠遠。', '柑橘', '木質', '麝香', 40),
  ('老山檀香 · 線香', '檀香', 880, '盒', '印度老山檀，溫潤奶甜。', '奶香', '檀木', '琥珀', 60),
  ('和敬 · 香道禮盒', '禮盒', 2400, '組', '香道入門禮盒，附香插與香品。', '花香', '木質', '龍涎', 25)
) as v(title, category, price, unit, description, top_smell, heart_smell, base_smell, inventory)
where not exists (select 1 from public.products p where p.title = v.title);

insert into public.promotions (code, name, kind, promo_group, priority, is_auto, conditions, effect)
select 'WELCOME100', '新客折 NT$100', '固定金額', 'coupon', 30, false, '{}'::jsonb, '{"type":"fixed","amount":100}'::jsonb
where not exists (select 1 from public.promotions where code = 'WELCOME100');


-- ==== 20260918000002_assign_catalog_images.sql ====

-- Use the curated ENSO category artwork already shipped with the frontend.
update public.products
set image_url = case title
  when '芽莊沈香 · 臥香' then '/images/冥想香氣.png'
  when '老山檀香 · 線香' then '/images/放鬆紓壓.png'
  when '和敬 · 香道禮盒' then '/images/空間淨化.png'
end,
images_url = case title
  when '芽莊沈香 · 臥香' then jsonb_build_array('/images/冥想香氣.png')
  when '老山檀香 · 線香' then jsonb_build_array('/images/放鬆紓壓.png')
  when '和敬 · 香道禮盒' then jsonb_build_array('/images/空間淨化.png')
end
where title in ('芽莊沈香 · 臥香', '老山檀香 · 線香', '和敬 · 香道禮盒');


-- ==== 20260918000003_membership_rules.sql ====

begin;

-- Centralise policy checks so clients cannot grant themselves distributor benefits.
create or replace function public.has_active_subscription(p_profile uuid, p_at timestamptz default now())
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select subscription_active
    and (subscription_expires_at is null or subscription_expires_at > p_at)
    from public.profiles where id = p_profile), false)
$$;

create or replace function public.distributor_discount(p_profile uuid, p_subtotal integer, p_at timestamptz default now())
returns integer language plpgsql stable security definer set search_path=public as $$
declare rate numeric;
begin
  if p_subtotal is null or p_subtotal < 0 then raise exception 'Invalid subtotal'; end if;
  select distributor_discount_rate into rate from public.profiles
    where id=p_profile and role='distributor'
      and subscription_active and (subscription_expires_at is null or subscription_expires_at > p_at);
  if not found then return 0; end if;
  return least(p_subtotal, floor(p_subtotal * greatest(0, least(coalesce(rate,0),100)) / 100)::integer);
end;
$$;
revoke all on function public.has_active_subscription(uuid,timestamptz) from public, anon;
revoke all on function public.distributor_discount(uuid,integer,timestamptz) from public, anon;
grant execute on function public.has_active_subscription(uuid,timestamptz) to authenticated, service_role;
grant execute on function public.distributor_discount(uuid,integer,timestamptz) to authenticated, service_role;
-- Subscription settings are privileged, even when a buyer can update their profile.
create or replace function public.guard_membership_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.subscription_active,new.subscription_started_at,new.subscription_expires_at,new.distributor_discount_rate)
    is distinct from row(old.subscription_active,old.subscription_started_at,old.subscription_expires_at,old.distributor_discount_rate)
    and coalesce(public.current_role(),'') <> 'admin'
    and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Only administrators can change membership benefits';
  end if;
  return new;
end $$;
drop trigger if exists guard_membership_privileges on public.profiles;
create trigger guard_membership_privileges before update on public.profiles
for each row execute function public.guard_membership_privileges();

create table if not exists public.subscription_changes (
 request_id uuid primary key, profile_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id), days integer not null check(days between 1 and 366),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
alter table public.subscription_changes enable row level security;
grant select on public.subscription_changes to authenticated;
grant all on public.subscription_changes to service_role;
drop policy if exists subscription_changes_read on public.subscription_changes;
create policy subscription_changes_read on public.subscription_changes for select to authenticated
using(profile_id=auth.uid() or public.current_role()='admin');

-- Admin test-mode activation/renewal. Retrying request_id never extends twice.
-- Active finite subscriptions extend from expiry; expired/disabled restart now.
create or replace function public.renew_subscription(p_profile uuid,p_days integer,p_request uuid)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare member public.profiles%rowtype; previous public.subscription_changes%rowtype;
 actor uuid := auth.uid(); expiry timestamptz;
begin
 if actor is null or coalesce(public.current_role(),'') <> 'admin' then raise exception 'Forbidden'; end if;
 if p_days is null or p_days not between 1 and 366 or p_request is null then raise exception 'Invalid renewal'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,1));
 select * into previous from public.subscription_changes where request_id=p_request;
 if found then
   if previous.profile_id<>p_profile or previous.days<>p_days then raise exception 'Renewal request conflict'; end if;
   return previous.expires_at;
 end if;
 select * into strict member from public.profiles where id=p_profile for update;
 if member.subscription_active and member.subscription_expires_at is null then
   raise exception 'Lifetime subscription does not require renewal';
 end if;
 expiry := (case when member.subscription_active then greatest(now(),member.subscription_expires_at) else now() end)
   + make_interval(days=>p_days);
 update public.profiles set subscription_active=true,
   subscription_started_at=case when member.subscription_active and member.subscription_expires_at>now()
      then coalesce(member.subscription_started_at,now()) else now() end,
   subscription_expires_at=expiry where id=p_profile;
 insert into public.subscription_changes(request_id,profile_id,actor_id,days,expires_at)
 values(p_request,p_profile,actor,p_days,expiry);
 insert into public.operation_logs(actor_id,action,details)
 values(actor,'subscription_renewed',jsonb_build_object('profile_id',p_profile,'days',p_days,'expires_at',expiry,'request_id',p_request));
 return expiry;
end $$;
revoke all on function public.renew_subscription(uuid,integer,uuid) from public,anon;
grant execute on function public.renew_subscription(uuid,integer,uuid) to authenticated;
commit;
