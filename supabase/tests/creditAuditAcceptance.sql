-- Run after migration 20260920000002; fixtures are rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); r public.credit_reconciliations; denied boolean:=false;
begin
perform set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,email) values(a,a||'@credit-test.invalid'),(b,b||'@credit-test.invalid');
insert into public.profiles(id,role) values(a,'finance'),(b,'customer') on conflict(id) do update set role=excluded.role;
insert into public.store_credit_ledger(member_id,type,amount) values(b,'earn',100),(b,'reverse',20);
perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',b)::text,true);
begin perform public.reconcile_credit(req,b,'test note'); exception when others then denied:=SQLERRM='Forbidden';end;
if not denied then raise exception 'customer not rejected';end if;
perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',a)::text,true);
r:=public.reconcile_credit(req,b,'test note');
if r.ledger_balance<>80 or r.ledger_count<>2 then raise exception 'balance mismatch';end if;
perform public.reconcile_credit(req,b,'test note');
if (select count(*) from public.credit_reconciliations where id=req)<>1 then raise exception 'duplicate';end if;
set local role authenticated;
if (select count(*) from public.credit_reconciliations where id=req)<>1 then raise exception 'finance read denied';end if;
reset role;
if (select count(*) from public.operation_logs where details->>'reconciliation_id'=req::text)<>1 then raise exception 'audit duplicate';end if;
perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',b)::text,true);
set local role authenticated;
if exists(select 1 from public.credit_reconciliations where id=req) then raise exception 'customer sees finance audit';end if;
reset role;
end $$;
select 'PASS credit reconciliation: finance allowed, customer denied, signed balance, idempotence, audit' as result;
rollback;


