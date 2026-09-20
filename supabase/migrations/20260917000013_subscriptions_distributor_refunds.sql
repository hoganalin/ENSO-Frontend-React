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
