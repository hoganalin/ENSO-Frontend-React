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
