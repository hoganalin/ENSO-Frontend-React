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
