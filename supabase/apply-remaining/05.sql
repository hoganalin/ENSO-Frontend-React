-- ============================================================
-- ENSO 待補 migration · 第 5/7 段 
-- 內含 3 支 migration，每支自帶 begin/commit，可安全重複執行
-- 在 Supabase SQL Editor 整段貼上按 Run；若出錯，修好後原樣重跑即可
-- ============================================================


-- ==== 20260919000004_partial_refunds_returns.sql ====

begin;
alter table public.refund_requests drop constraint if exists refund_requests_order_id_key;
alter table public.refund_requests add column if not exists request_key uuid;
create unique index if not exists refund_request_key on public.refund_requests(requested_by,request_key) where request_key is not null;
create or replace function public.request_partial_refund(p_order uuid,p_amount integer,p_reason text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; row public.refund_requests%rowtype; reserved bigint;
begin
 select * into ord from public.orders where id=p_order and buyer_id=auth.uid() for update;
 if not found then raise exception 'Order not found'; end if;
 select * into row from public.refund_requests where requested_by=auth.uid() and request_key=p_request_key;
 if found then
  if row.order_id<>p_order or row.amount<>p_amount or row.reason<>trim(p_reason) then raise exception 'Request key conflict'; end if;
  return to_jsonb(row);
 end if;
 if ord.status not in ('paid','shipped','completed') then raise exception 'Order cannot be refunded'; end if;
 if p_request_key is null or p_amount is null or p_amount<1 or coalesce(length(trim(p_reason)),0) not between 1 and 1000 then raise exception 'Invalid refund'; end if;
 select coalesce(sum(amount),0) into reserved from public.refund_requests where order_id=p_order and status<>'rejected';
 if p_amount+reserved>ord.total then raise exception 'Refund exceeds available balance'; end if;
 insert into public.refund_requests(order_id,requested_by,amount,reason,request_key) values(p_order,auth.uid(),p_amount,trim(p_reason),p_request_key) returning * into row;
 return to_jsonb(row);
end $$;
revoke all on function public.request_partial_refund(uuid,integer,text,uuid) from public,anon;
grant execute on function public.request_partial_refund(uuid,integer,text,uuid) to authenticated;
-- Retain the legacy RPC, with a stable key to make old clients safe to retry.
create or replace function public.request_refund(p_order uuid,p_amount integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin return public.request_partial_refund(p_order,p_amount,p_reason,p_order); end $$;
create or replace function public.complete_refund(p_actor uuid,p_order uuid,p_refund uuid,p_status text,p_provider_reference text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; row public.refund_requests%rowtype; ord public.orders%rowtype; refunded bigint; credit record; reversed bigint; target bigint;
begin
 select role::text into actor_role from public.profiles where id=p_actor;
 if actor_role is null or actor_role not in ('finance','admin') then raise exception 'Forbidden'; end if;
 if p_status is null or p_status not in ('succeeded','failed','uncertain','rejected') then raise exception 'Invalid refund result'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 select * into row from public.refund_requests where id=p_refund and order_id=p_order for update;
 if not found then raise exception 'Refund not found'; end if;
 if row.status='succeeded' then return to_jsonb(row); end if;
 if row.status='rejected' then raise exception 'Rejected refund'; end if;
 if row.status='uncertain' and p_status='rejected' then raise exception 'Resolve uncertain payment before rejection'; end if;
 if p_status='succeeded' then
  if ord.status not in ('paid','shipped','completed') then raise exception 'Order cannot be refunded'; end if;
  select coalesce(sum(amount),0)+row.amount into refunded from public.refund_requests where order_id=p_order and status='succeeded';
  if refunded>ord.total then raise exception 'Refund exceeds order total'; end if;
  for credit in select member_id,sum(amount)::bigint amount from public.store_credit_ledger where order_id=p_order and type='earn' group by member_id loop
   select coalesce(sum(amount),0) into reversed from public.store_credit_ledger where order_id=p_order and type='reverse' and member_id=credit.member_id;
   target:=floor(credit.amount::numeric*refunded/ord.total);
   if target>reversed then insert into public.store_credit_ledger(member_id,type,amount,order_id) values(credit.member_id,'reverse',target-reversed,p_order); end if;
  end loop;
  if refunded=ord.total then update public.orders set status='refunded' where id=p_order; end if;
 end if;
 update public.refund_requests set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),last_error=left(p_error,1000),reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_refund returning * into row;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'refund_'||p_status,p_order,jsonb_build_object('refund_id',p_refund,'amount',row.amount,'provider_reference',row.provider_reference));
 return to_jsonb(row);
end $$;
-- Returns are independent from financial refunds. Each receipt has one idempotency key.
create table if not exists public.return_receipts(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 order_item_id uuid not null references public.order_items(id),quantity integer not null check(quantity>0),
 request_key uuid not null unique,received_by uuid not null references public.profiles(id),
 note text not null check(length(trim(note)) between 1 and 1000),created_at timestamptz not null default now()
);
alter table public.return_receipts enable row level security;
grant select on public.return_receipts to authenticated;
grant all on public.return_receipts to service_role;
drop policy if exists return_receipts_read on public.return_receipts;
create policy return_receipts_read on public.return_receipts for select using(public.current_role() in ('admin','warehouse','finance','support') or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
create or replace function public.receive_order_return(p_actor uuid,p_order uuid,p_item uuid,p_quantity integer,p_request_key uuid,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; ord public.orders%rowtype; item public.order_items%rowtype; product public.products%rowtype; receipt public.return_receipts%rowtype; received bigint;
begin
 select role::text into actor_role from public.profiles where id=p_actor;
 if actor_role is null or actor_role not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 select * into receipt from public.return_receipts where request_key=p_request_key;
 if found then
  if receipt.order_id<>p_order or receipt.order_item_id<>p_item or receipt.quantity<>p_quantity or receipt.note<>trim(p_note) then raise exception 'Request key conflict'; end if;
  return to_jsonb(receipt);
 end if;
 if ord.shipped_at is null then raise exception 'Unshipped order has no stock to return'; end if;
 if p_request_key is null or p_quantity is null or p_quantity<1 or coalesce(length(trim(p_note)),0) not between 1 and 1000 then raise exception 'Invalid receipt'; end if;
 select * into item from public.order_items where id=p_item and order_id=p_order;
 if not found then raise exception 'Item not found'; end if;
 select coalesce(sum(quantity),0) into received from public.return_receipts where order_item_id=p_item;
 if received+p_quantity>item.qty then raise exception 'Return exceeds shipped quantity'; end if;
 select * into product from public.products where id=item.product_id for update;
 if not found then raise exception 'Product not found'; end if;
 update public.products set inventory=inventory+p_quantity where id=product.id;
 insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id) values(product.id,product.title,'add',p_quantity,product.inventory,product.inventory+p_quantity,'退貨驗收 '||ord.order_no||'：'||trim(p_note),p_actor);
 insert into public.return_receipts(order_id,order_item_id,quantity,request_key,received_by,note) values(p_order,p_item,p_quantity,p_request_key,p_actor,trim(p_note)) returning * into receipt;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'return_received',p_order,jsonb_build_object('receipt_id',receipt.id,'item_id',p_item,'quantity',p_quantity));
 return to_jsonb(receipt);
end $$;
revoke all on function public.receive_order_return(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.receive_order_return(uuid,uuid,uuid,integer,uuid,text) to service_role;
commit;


-- ==== 20260919000006_marketing_vip.sql ====

begin;
alter table public.products add column if not exists vip_only boolean not null default false,
  add column if not exists available_at timestamptz,
  add column if not exists vip_available_at timestamptz;
alter table public.products drop constraint if exists product_vip_window;
alter table public.products add constraint product_vip_window check
  (vip_available_at is null or (available_at is not null and vip_available_at <= available_at));
alter table public.promotions add column if not exists vip_starts_at timestamptz;
alter table public.promotions drop constraint if exists promotion_vip_window;
alter table public.promotions add constraint promotion_vip_window check
  (vip_starts_at is null or (starts_at is not null and vip_starts_at <= starts_at));

-- Enforce current product access inside the order transaction, including direct RPC callers.
create or replace function public.guard_vip_order_item() returns trigger
language plpgsql security definer set search_path=public as $$
declare product public.products%rowtype; tier text; opens_at timestamptz;
begin
 select * into product from public.products where id=new.product_id for share;
 select p.member_tier::text into tier from public.profiles p join public.orders o on o.buyer_id=p.id
   where o.id=new.order_id for share of p;
 if product.vip_only and tier is distinct from 'gold' then raise exception '此商品限 VIP 金卡會員購買'; end if;
 opens_at := case when tier='gold' then coalesce(product.vip_available_at,product.available_at) else product.available_at end;
 if opens_at>now() then raise exception '商品尚未開放此會員購買'; end if;
 return new;
end $$;
drop trigger if exists guard_vip_order_item on public.order_items;
create trigger guard_vip_order_item before insert on public.order_items
  for each row execute function public.guard_vip_order_item();

create table if not exists public.marketing_campaigns (
 id uuid primary key,
 created_by uuid not null references public.profiles(id),
 title text not null check(length(title) between 1 and 100),
 message text not null check(length(message) between 1 and 2000),
 segment text not null check(segment in ('all','normal','silver','gold','first','repeat')),
 recipient_count integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.member_messages (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.marketing_campaigns(id),
 member_id uuid not null references public.profiles(id),
 title text not null, message text not null,
 created_at timestamptz not null default now(),
 unique(campaign_id,member_id)
);
alter table public.marketing_campaigns enable row level security;
alter table public.member_messages enable row level security;
revoke all on public.marketing_campaigns,public.member_messages from anon,authenticated;
grant select on public.marketing_campaigns,public.member_messages to authenticated;
grant all on public.marketing_campaigns,public.member_messages to service_role;
drop policy if exists campaign_staff_read on public.marketing_campaigns;
create policy campaign_staff_read on public.marketing_campaigns for select to authenticated
 using(public.current_role() in ('marketing','admin'));
drop policy if exists inbox_self_read on public.member_messages;
create policy inbox_self_read on public.member_messages for select to authenticated using(member_id=auth.uid());

create or replace function public.marketing_segment_members(p_segment text)
returns table(id uuid,name text,member_tier text,order_count bigint,total_count bigint)
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(public.current_role()::text,'') not in ('marketing','admin') or auth.uid() is null then raise exception 'Forbidden'; end if;
 if p_segment is null or p_segment not in ('all','normal','silver','gold','first','repeat') then raise exception 'Invalid segment'; end if;
 return query select p.id,p.name,p.member_tier::text,
   (select count(*) from public.orders o where o.buyer_id=p.id and o.status in ('paid','shipped','completed')),count(*) over()
 from public.profiles p where p.role in ('customer','referral_partner','distributor')
 and (p_segment='all' or p_segment=p.member_tier::text
   or (p_segment='first' and not exists(select 1 from public.orders o where o.buyer_id=p.id and o.status in ('paid','shipped','completed')))
   or (p_segment='repeat' and exists(select 1 from public.orders o where o.buyer_id=p.id and o.status in ('paid','shipped','completed'))));
end $$;

create or replace function public.publish_member_message(p_request_id uuid,p_segment text,p_title text,p_message text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare campaign public.marketing_campaigns%rowtype; recipients integer;
begin
 if coalesce(public.current_role()::text,'') not in ('marketing','admin') or auth.uid() is null then raise exception 'Forbidden'; end if;
 if p_request_id is null or p_segment is null or p_segment not in ('all','normal','silver','gold','first','repeat')
   or p_title is null or length(trim(p_title)) not between 1 and 100
   or p_message is null or length(trim(p_message)) not between 1 and 2000 then raise exception 'Invalid message'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into campaign from public.marketing_campaigns where id=p_request_id;
 if found then
   if campaign.created_by<>auth.uid() or campaign.segment<>p_segment or campaign.title<>trim(p_title) or campaign.message<>trim(p_message)
     then raise exception 'Request key reused'; end if;
   return to_jsonb(campaign);
 end if;
 insert into public.marketing_campaigns(id,created_by,title,message,segment)
 values(p_request_id,auth.uid(),trim(p_title),trim(p_message),p_segment);
 insert into public.member_messages(campaign_id,member_id,title,message)
 select p_request_id,s.id,trim(p_title),trim(p_message) from public.marketing_segment_members(p_segment) s;
 get diagnostics recipients=row_count;
 update public.marketing_campaigns set recipient_count=recipients where id=p_request_id returning * into campaign;
 insert into public.operation_logs(actor_id,action,details)
 values(auth.uid(),'member_message_published',jsonb_build_object('campaign_id',p_request_id,'segment',p_segment,'recipient_count',recipients));
 return to_jsonb(campaign);
end $$;
revoke all on function public.marketing_segment_members(text) from public,anon;
revoke all on function public.publish_member_message(uuid,text,text,text) from public,anon;
grant execute on function public.marketing_segment_members(text),public.publish_member_message(uuid,text,text,text) to authenticated;
commit;


-- ==== 20260919000007_order_operations_notes.sql ====

begin;
create table if not exists public.order_notes (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 actor_id uuid not null references public.profiles(id), body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
alter table public.order_notes enable row level security;
revoke all on public.order_notes from anon,authenticated;
grant select,insert on public.order_notes to authenticated;
grant all on public.order_notes to service_role;
drop policy if exists order_notes_read on public.order_notes;
create policy order_notes_read on public.order_notes for select to authenticated
 using(public.current_role() in ('support','warehouse','finance','admin'));
drop policy if exists order_notes_write on public.order_notes;
create policy order_notes_write on public.order_notes for insert to authenticated
 with check(actor_id=auth.uid() and public.current_role() in ('support','admin'));
create table if not exists public.order_picking (
 order_id uuid primary key references public.orders(id), actor_id uuid not null references public.profiles(id),
 items jsonb not null, created_at timestamptz not null default now()
);
alter table public.order_picking enable row level security;
revoke all on public.order_picking from anon,authenticated;
grant select on public.order_picking to authenticated;
grant all on public.order_picking to service_role;
drop policy if exists order_picking_read on public.order_picking;
create policy order_picking_read on public.order_picking for select to authenticated
 using(public.current_role() in ('support','warehouse','finance','admin'));
create or replace function public.confirm_order_picking(p_order uuid) returns public.order_picking
 language plpgsql security definer set search_path=public as $$
 declare ord public.orders%rowtype; picked public.order_picking%rowtype; lines jsonb;
 begin
  if auth.uid() is null or coalesce(public.current_role()::text,'') not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
  select * into ord from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select * into picked from public.order_picking where order_id=p_order;
  if found then return picked; end if;
  if ord.status<>'paid' then raise exception 'Only paid orders may be picked'; end if;
  select jsonb_agg(jsonb_build_object('product_id',product_id,'title',title,'qty',qty) order by id)
   into lines from public.order_items where order_id=p_order;
  if lines is null then raise exception 'Order has no items'; end if;
  insert into public.order_picking(order_id,actor_id,items) values(p_order,auth.uid(),lines) returning * into picked;
  insert into public.operation_logs(actor_id,action,order_id,details) values(auth.uid(),'picking_confirmed',p_order,jsonb_build_object('items',lines));
  return picked;
 end $$;
revoke all on function public.confirm_order_picking(uuid) from public,anon;
grant execute on function public.confirm_order_picking(uuid) to authenticated;
commit;
