-- Role/RLS acceptance. Fixtures and all state changes roll back.
begin;
create function pg_temp.role_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function pg_temp.role_denied(statement text) returns void language plpgsql as $$
declare denied boolean := false;
begin begin execute statement; exception when insufficient_privilege then denied:=true; end;
perform pg_temp.role_assert(denied,'must reject direct privileged mutation'); end $$;
do $$
declare actors uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
roles text[] := array['customer','distributor','support','warehouse','finance','admin'];
o uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); p uuid := gen_random_uuid(); j uuid; i int; n int; denied boolean;
begin
perform set_config('request.jwt.claims','{"role":"service_role"}',true);
for i in 1..6 loop
 insert into auth.users(id,email,raw_user_meta_data) values(actors[i],actors[i]::text||'@role-acceptance.invalid','{}');
 insert into public.profiles(id,role) values(actors[i],roles[i]::public.user_role) on conflict(id) do update set role=excluded.role;
end loop;
insert into public.products(id,title,price,inventory) values(p,'Role acceptance fixture',100,10);
insert into public.orders(id,buyer_id,total,subtotal,status) values(o,actors[1],100,100,'pending'),(o2,actors[2],100,100,'pending');
insert into public.order_items(order_id,product_id,title,unit_price,qty) values(o,p,'Role fixture',100,1),(o2,p,'Role fixture',100,1);
update public.orders set status='paid',payment_gateway_trade_no='ROLE'||replace(o::text,'-','') where id=o;
select id into j from public.delivery_jobs where order_id=o and kind='buyer_sms';
perform pg_temp.role_assert(j is not null,'paid order enqueues buyer SMS');
for i in 1..6 loop
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actors[i])::text,true);
 set local role authenticated;
 select count(*) into n from public.orders where id in(o,o2);
 perform pg_temp.role_assert(n=case when i<=2 then 1 else 2 end,roles[i]||' order visibility');
 select count(*) into n from public.order_items where order_id in(o,o2);
 perform pg_temp.role_assert(n=case when i<=2 then 1 else 2 end,roles[i]||' item visibility');
 select count(*) into n from public.delivery_jobs where id=j;
 perform pg_temp.role_assert(n=case when i in(3,5,6) then 1 else 0 end,roles[i]||' notification visibility');
 perform pg_temp.role_denied(format('update public.orders set total=1 where id=%L',o));
 perform pg_temp.role_denied(format('select public.admin_order_action(%L,%L,''cancel'')',actors[6],o2));
 denied:=false;
 begin perform public.renew_subscription(actors[2],30,gen_random_uuid()); exception when others then
  if SQLERRM='Forbidden' then denied:=true; else raise; end if;
 end;
 perform pg_temp.role_assert(denied=(i<>6),roles[i]||' subscription renewal authority');
 reset role;
 -- Server-only RPC checks actor role in addition to denying browser execution.
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 denied:=false;
 begin perform public.admin_order_action(actors[i],o2,'update_recipient','{"name":"Fixture","tel":"0912345678","email":"fixture@example.invalid","address":"Test address 123"}');
 exception when others then if SQLERRM='Forbidden action' then denied:=true; else raise; end if; end;
 perform pg_temp.role_assert(denied=(i not in(3,6)),roles[i]||' recipient change authority');
 update public.delivery_jobs set status='uncertain',attempts=1 where id=j;
 denied:=false;
 begin perform public.reconcile_delivery_job(j,actors[i],'confirmed_sent','Role acceptance fixture','MOCK-ROLE');
 exception when others then if SQLERRM in ('Forbidden','僅財務與管理員可對帳') then denied:=true; else raise; end if; end;
 perform pg_temp.role_assert(denied=(i not in(5,6)),roles[i]||' notification reconciliation authority');
 -- Return fixture to paid before checking each independent shipping permission.
 update public.orders set status='paid',tracking_number=null where id=o;
 denied:=false;
 begin perform public.admin_order_action(actors[i],o,'ship',null,'ROLE-TRACKING');
 exception when others then if SQLERRM='Forbidden action' then denied:=true; else raise; end if; end;
 perform pg_temp.role_assert(denied=(i not in(4,6)),roles[i]||' shipping authority');
end loop;
perform pg_temp.role_assert(not has_function_privilege('authenticated','public.reconcile_delivery_job(uuid,uuid,text,text,text)','execute'),'reconcile is server only');
perform pg_temp.role_assert(not has_function_privilege('authenticated','public.complete_refund(uuid,uuid,uuid,text,text,text)','execute'),'refund settlement is server only');
end $$;
select 'PASS: 6 roles; order/item RLS, notification RLS, direct write denial, actor spoof denial, renewal and recipient authority' as result;
rollback;




