-- Remote integration acceptance; every fixture is rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.must_fail(statement text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin execute statement; exception when others then failed := true; end;
  perform pg_temp.assert_true(failed,'Expected rejection: '||statement);
end $$;
do $$
declare
 a uuid := gen_random_uuid(); buyer uuid := gen_random_uuid(); o uuid := gen_random_uuid();
 r uuid := gen_random_uuid(); j uuid := gen_random_uuid(); inv uuid := gen_random_uuid();
 request_id uuid := gen_random_uuid(); expiry timestamptz; again timestamptz;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,a::text||'@acceptance.invalid','{}'),(buyer,buyer::text||'@acceptance.invalid','{}');
 insert into public.profiles(id,role) values(a,'admin'),(buyer,'distributor') on conflict(id) do update set role=excluded.role;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',a)::text,true);
 expiry := public.renew_subscription(buyer,30,request_id);
 again := public.renew_subscription(buyer,30,request_id);
 perform pg_temp.assert_true(expiry=again,'renewal must be idempotent');
 perform pg_temp.assert_true((select count(*)=1 from public.subscription_changes where profile_id=buyer),'one renewal audit');
 update public.profiles set distributor_discount_rate=10 where id=buyer;
 perform pg_temp.assert_true(public.distributor_discount(buyer,1000)=100,'active distributor discount');
 update public.profiles set subscription_expires_at=now()-interval '1 day' where id=buyer;
 perform pg_temp.assert_true(public.distributor_discount(buyer,1000)=0,'expired subscription discount');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',buyer)::text,true);
 perform pg_temp.must_fail(format('select public.renew_subscription(%L,30,%L)',buyer,gen_random_uuid()));
 perform pg_temp.must_fail(format('update public.profiles set distributor_discount_rate=90 where id=%L',buyer));
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.orders(id,buyer_id,total,subtotal,status) values(o,buyer,1000,1000,'paid');
 inv := (public.create_mock_invoice(a,o)->>'id')::uuid;
 perform pg_temp.assert_true((public.create_mock_invoice(a,o)->>'id')::uuid=inv,'one mock invoice per order');
 insert into public.refund_requests(id,order_id,requested_by,amount,reason) values(r,o,buyer,1000,'integration fixture');
 insert into public.store_credit_ledger(member_id,type,amount,order_id) values(buyer,'earn',100,o);
 perform pg_temp.must_fail(format('select public.complete_refund(%L,%L,%L,''succeeded'')',buyer,o,r));
 perform public.complete_refund(a,o,r,'succeeded','MOCK-REFUND');
 perform public.complete_refund(a,o,r,'failed',null);
 perform pg_temp.assert_true((select status='refunded' from public.orders where id=o),'refunded order');
 perform pg_temp.assert_true((select status='succeeded' from public.refund_requests where id=r),'success is terminal');
 perform pg_temp.assert_true((select count(*)=1 and sum(amount)=100 from public.store_credit_ledger where order_id=o and type='reverse'),'single credit reversal');
 update public.invoices set provider='ecpay' where id=inv;
 perform pg_temp.must_fail(format('select public.void_invoice(%L,%L,%L,''MOCK-VOID'')',a,o,inv));
 update public.invoices set provider='mock' where id=inv;
 perform public.void_invoice(a,o,inv,'MOCK-VOID');
 perform public.void_invoice(a,o,inv,'MOCK-VOID');
 perform pg_temp.assert_true((select status='voided' from public.invoices where id=inv),'void invoice');
 insert into public.delivery_jobs(id,order_id,kind,status,attempts) values(j,o,'buyer_sms','uncertain',1)
 on conflict(order_id,kind) do update set status='uncertain',attempts=1 returning id into j;
 perform pg_temp.must_fail(format('select public.reconcile_delivery_job(%L,%L,''confirmed_not_sent'',''checked provider'')',j,buyer));
 perform public.reconcile_delivery_job(j,a,'confirmed_not_sent','checked provider: no delivery');
 perform pg_temp.assert_true((select status='pending' from public.delivery_jobs where id=j),'requeue confirmed unsent');
 update public.delivery_jobs set status='uncertain' where id=j;
 perform public.reconcile_delivery_job(j,a,'confirmed_sent','checked provider accepted','MOCK-SMS');
 perform pg_temp.assert_true((select status='succeeded' from public.delivery_jobs where id=j),'confirmed delivered');
 perform pg_temp.assert_true((select count(*)=2 from public.delivery_reconciliations where job_id=j),'two reconciliation audits');
 update public.delivery_jobs set status='failed',attempts=5 where id=j;
 perform pg_temp.must_fail(format('select public.reconcile_delivery_job(%L,%L,''confirmed_not_sent'',''checked provider'')',j,a));
 perform pg_temp.assert_true(not has_function_privilege('authenticated','public.complete_refund(uuid,uuid,uuid,text,text,text)','EXECUTE'),'browser cannot invoke settlement');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','public.reconcile_delivery_job(uuid,uuid,text,text,text)','EXECUTE'),'browser cannot impersonate reconciliation actor');
end $$;
select 'PASS: subscription, authorization, refund, credit reversal, invoice void, SMS reconciliation, retry limit' as result;
rollback;
