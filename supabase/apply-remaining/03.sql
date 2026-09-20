-- ============================================================
-- ENSO 待補 migration · 第 3/7 段 
-- 內含 4 支 migration，每支自帶 begin/commit，可安全重複執行
-- 在 Supabase SQL Editor 整段貼上按 Run；若出錯，修好後原樣重跑即可
-- ============================================================


-- ==== 20260918000014_delivery_reconciliation.sql ====

begin;
alter table public.sms_log add column if not exists is_simulated boolean not null default false;
alter table public.sms_log add column if not exists delivery_job_id uuid references public.delivery_jobs(id);
create table if not exists public.delivery_reconciliations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs(id),
  actor_id uuid not null references public.profiles(id),
  outcome text not null check(outcome in ('confirmed_sent','confirmed_not_sent')),
  note text not null check(length(btrim(note)) between 5 and 1000),
  provider_reference text,
  previous_status text not null,
  created_at timestamptz not null default now()
);
alter table public.delivery_reconciliations enable row level security;
revoke all on public.delivery_reconciliations from anon,authenticated;
grant select on public.delivery_reconciliations to authenticated;
grant all on public.delivery_reconciliations to service_role;
drop policy if exists delivery_reconciliation_read on public.delivery_reconciliations;
create policy delivery_reconciliation_read on public.delivery_reconciliations for select
  using(public.current_role() in ('finance','admin'));
-- Retire the unaudited operation, including existing deployments.
drop function if exists public.requeue_delivery_job(uuid);
create or replace function public.reconcile_delivery_job(p_id uuid,p_actor uuid,p_outcome text,p_note text,p_reference text default null)
returns public.delivery_jobs language plpgsql security definer set search_path=public as $$
declare v_job public.delivery_jobs;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role in ('finance','admin')) then
    raise exception '僅財務與管理員可對帳';
  end if;
  if p_outcome is null or p_outcome not in ('confirmed_sent','confirmed_not_sent') or p_note is null
    or length(btrim(p_note)) not between 5 and 1000 then raise exception '請填寫有效對帳結果與核對紀錄'; end if;
  select * into v_job from public.delivery_jobs where id=p_id for update;
  if not found or v_job.status not in ('uncertain','failed') then raise exception '僅失敗或結果不明的工作可對帳'; end if;
  -- Invoice success requires its own durable invoice record, not merely an operator assertion.
  if p_outcome='confirmed_sent' and v_job.kind='invoice' and not exists(
    select 1 from public.invoices where order_id=v_job.order_id and status='issued'
  ) then raise exception '請先同步已開立發票紀錄再確認成功'; end if;
  if p_outcome='confirmed_sent' and nullif(btrim(p_reference),'') is null then raise exception '確認已送出需提供供應商單號'; end if;
  if p_outcome='confirmed_not_sent' and v_job.attempts>=5 then raise exception '已達 5 次上限，請先排除根本原因'; end if;
  insert into public.delivery_reconciliations(job_id,actor_id,outcome,note,provider_reference,previous_status)
    values(p_id,p_actor,p_outcome,btrim(p_note),nullif(btrim(p_reference),''),v_job.status);
  update public.delivery_jobs set status=case when p_outcome='confirmed_sent' then 'succeeded' else 'pending' end,
    provider_reference=case when p_outcome='confirmed_sent' then btrim(p_reference) else null end,
    last_error=null,lease_token=null,lease_until=null,next_attempt_at=now(),updated_at=now()
    where id=p_id returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.reconcile_delivery_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_delivery_job(uuid,uuid,text,text,text) to service_role;
commit;


-- ==== 20260918000015_refund_invoice_operations.sql ====

begin;

-- Testable, audited after-sales operations. Provider calls remain outside this
-- migration; the Edge Function supplies a mock provider reference in test mode.
create or replace function public.complete_refund(
  p_actor uuid, p_order uuid, p_refund uuid, p_status text, p_provider_reference text default null, p_error text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; row public.refund_requests%rowtype; ord public.orders%rowtype;
begin
  select role::text into actor_role from public.profiles where id=p_actor;
  if actor_role is null or actor_role not in ('finance','admin') then raise exception 'Forbidden'; end if;
  if p_status not in ('succeeded','failed','uncertain') then raise exception 'Invalid refund result'; end if;
  select * into row from public.refund_requests where id=p_refund for update;
  if not found then raise exception 'Refund not found'; end if;
  if row.order_id <> p_order then raise exception 'Order mismatch'; end if;
  if row.status='succeeded' then return to_jsonb(row); end if;
  if row.status='rejected' then raise exception 'Rejected refund'; end if;
  select * into ord from public.orders where id=row.order_id for update;
  if row.amount <> ord.total then raise exception 'Only full refunds supported'; end if;
  if p_status='succeeded' then
    if ord.status not in ('paid','shipped','completed','refunded') then raise exception 'Order cannot be refunded'; end if;
    insert into public.store_credit_ledger(member_id,type,amount,order_id)
      select member_id,'reverse',sum(amount),ord.id from public.store_credit_ledger
      where order_id=ord.id and type='earn' and not exists (select 1 from public.store_credit_ledger where order_id=ord.id and type='reverse') group by member_id;
    update public.orders set status='refunded' where id=ord.id and status <> 'refunded';
  end if;
  update public.refund_requests set status=p_status, provider_reference=coalesce(p_provider_reference,provider_reference),
    last_error=case when p_error is null then null else left(p_error,1000) end,
    reviewed_by=p_actor, reviewed_at=now(), updated_at=now() where id=row.id returning * into row;
  insert into public.operation_logs(actor_id,action,order_id,details)
    values(p_actor,'refund_'||p_status,row.order_id,jsonb_build_object('amount',row.amount,'provider_reference',row.provider_reference,'error',row.last_error));
  return to_jsonb(row);
end;
$$;
revoke all on function public.complete_refund(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_refund(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.void_invoice(p_actor uuid, p_order uuid, p_invoice uuid, p_provider_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; row public.invoices%rowtype;
begin
  select role::text into actor_role from public.profiles where id=p_actor;
  if actor_role is null or actor_role not in ('finance','admin') then raise exception 'Forbidden'; end if;
  select * into row from public.invoices where id=p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if row.order_id <> p_order then raise exception 'Order mismatch'; end if;
  if row.status='voided' then return to_jsonb(row); end if;
  if row.status <> 'issued' then raise exception 'Only issued invoices can be voided'; end if;
  update public.invoices set status='voided', error_message=null, response_payload=jsonb_build_object('voided',true,'provider_reference',p_provider_reference), updated_at=now() where id=row.id returning * into row;
  insert into public.operation_logs(actor_id,action,order_id,details)
    values(p_actor,'invoice_voided',row.order_id,jsonb_build_object('invoice_id',row.id,'invoice_number',row.invoice_number,'provider_reference',p_provider_reference));
  return to_jsonb(row);
end;
$$;
revoke all on function public.void_invoice(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_invoice(uuid,uuid,uuid,text) to service_role;
commit;


-- ==== 20260919000001_fix_membership_role_cast.sql ====

begin;
create or replace function public.guard_membership_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.subscription_active,new.subscription_started_at,new.subscription_expires_at,new.distributor_discount_rate)
    is distinct from row(old.subscription_active,old.subscription_started_at,old.subscription_expires_at,old.distributor_discount_rate)
    and coalesce(public.current_role()::text,'') <> 'admin'
    and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Only administrators can change membership benefits';
  end if;
  return new;
end $$;
create or replace function public.renew_subscription(p_profile uuid,p_days integer,p_request uuid)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare member public.profiles%rowtype; previous public.subscription_changes%rowtype;
 actor uuid := auth.uid(); expiry timestamptz;
begin
 if actor is null or coalesce(public.current_role()::text,'') <> 'admin' then raise exception 'Forbidden'; end if;
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
commit;


-- ==== 20260919000002_mock_invoice.sql ====

begin;
create or replace function public.create_mock_invoice(p_actor uuid,p_order uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; inv public.invoices%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role in ('admin','finance')) then raise exception 'Forbidden'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found or ord.status not in ('paid','shipped','completed') then raise exception 'Paid order required'; end if;
 select * into inv from public.invoices where order_id=p_order;
 if found then return to_jsonb(inv); end if;
 insert into public.invoices(order_id,provider,relate_number,invoice_number,amount,status,response_payload,issued_at)
 values(p_order,'mock','MOCK-'||p_order,'MOCK-'||left(p_order::text,8),ord.total,'issued','{"simulated":true}',now()) returning * into inv;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'mock_invoice_created',p_order,jsonb_build_object('invoice_id',inv.id));
 return to_jsonb(inv);
end $$;
revoke all on function public.create_mock_invoice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_mock_invoice(uuid,uuid) to service_role;

-- A mock void must never relabel an actual provider invoice as voided.
create or replace function public.guard_mock_invoice_void()
returns trigger language plpgsql as $$
begin
 if new.status='voided' and old.status<>'voided'
   and new.response_payload->>'provider_reference' like 'MOCK-%' and old.provider<>'mock' then
   raise exception 'Mock void only supports mock invoices';
 end if;
 return new;
end $$;
drop trigger if exists guard_mock_invoice_void on public.invoices;
create trigger guard_mock_invoice_void before update on public.invoices
for each row execute function public.guard_mock_invoice_void();
commit;
