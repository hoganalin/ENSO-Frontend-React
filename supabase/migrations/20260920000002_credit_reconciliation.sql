begin;
create table if not exists public.credit_reconciliations (
 id uuid primary key,
 member_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id),
 ledger_count bigint not null,
 ledger_balance bigint not null,
 note text not null,
 created_at timestamptz not null default now()
);
alter table public.credit_reconciliations enable row level security;
grant select on public.credit_reconciliations to authenticated;
drop policy if exists credit_reconciliations_read on public.credit_reconciliations;
create policy credit_reconciliations_read on public.credit_reconciliations for select to authenticated using(public.current_role() in ('finance','admin'));
create or replace function public.reconcile_credit(p_request uuid,p_member uuid,p_note text) returns public.credit_reconciliations
language plpgsql security definer set search_path=public as $$
declare result public.credit_reconciliations; n bigint; balance bigint;
begin
 if auth.uid() is null or coalesce(public.current_role()::text,'') not in ('finance','admin') then raise exception 'Forbidden'; end if;
 if p_request is null or length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Reconciliation note required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,2));
 select * into result from public.credit_reconciliations where id=p_request;
 if found then
  if result.member_id<>p_member or result.note<>trim(p_note) then raise exception 'Request conflict'; end if;
  return result;
 end if;
 select count(*),coalesce(sum(case when type='earn' then amount else -amount end),0) into n,balance from public.store_credit_ledger where member_id=p_member;
 if n=0 then raise exception 'No ledger entries'; end if;
 insert into public.credit_reconciliations(id,member_id,actor_id,ledger_count,ledger_balance,note) values(p_request,p_member,auth.uid(),n,balance,trim(p_note)) returning * into result;
 insert into public.operation_logs(actor_id,action,details) values(auth.uid(),'credit_reconciled',jsonb_build_object('member_id',p_member,'reconciliation_id',p_request,'ledger_count',n,'ledger_balance',balance));
 return result;
end $$;
revoke all on function public.reconcile_credit(uuid,uuid,text) from public,anon;
grant execute on function public.reconcile_credit(uuid,uuid,text) to authenticated;
commit;

