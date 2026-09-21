begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.reward_order(b uuid,r uuid,tier text default 'silver') returns uuid language plpgsql as $$
declare o uuid:=gen_random_uuid(); trade text:=left(replace(o::text,'-',''),20);
begin
 insert into public.orders(id,buyer_id,referrer_id,referrer_tier_snapshot,total,subtotal,status) values(o,b,r,tier::public.member_tier,1000,1000,'pending');
 insert into public.payment_transactions(order_id,merchant_trade_no,amount) values(o,trade,1000);
 perform public.settle_ecpay_payment(trade,'GATEWAY-'||trade,1000,'Credit',true,'{}');
 return o;
end $$;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); fixed_id uuid:=gen_random_uuid(); percent_id uuid:=gen_random_uuid(); o uuid; o2 uuid; o3 uuid; o4 uuid; refund uuid; trade text;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_user_meta_data) values(a,a||'@acceptance.invalid','{}'),(b,b||'@acceptance.invalid','{}'),(r,r||'@acceptance.invalid','{}');
 insert into public.profiles(id,role) values(a,'admin'),(b,'customer'),(r,'customer') on conflict(id) do update set role=excluded.role;
 insert into public.app_settings(key,value) values('silver_cashback_rate','10'),('gold_cashback_rate','20') on conflict(key) do update set value=excluded.value;
 update public.referral_reward_campaigns set is_active=false;
 insert into public.referral_reward_campaigns(id,name,reward_type,reward_value,priority,starts_at,ends_at) values(fixed_id,'Fixed fixture','fixed',50,10,now()-interval '1 hour',now()+interval '1 hour');
 o:=pg_temp.reward_order(b,r);
 perform pg_temp.assert_true((select amount=150 from public.store_credit_ledger where order_id=o and type='earn'),'base 100 plus fixed 50');
 trade:=left(replace(o::text,'-',''),20);
 perform public.settle_ecpay_payment(trade,'GATEWAY-'||trade,1000,'Credit',true,'{}');
 perform pg_temp.assert_true((select count(*)=1 from public.store_credit_ledger where order_id=o and type='earn'),'duplicate callback one earning');
 perform pg_temp.assert_true((select bonus_credit=50 and base_credit=100 from public.referral_reward_snapshots where order_id=o),'reward snapshot');
 insert into public.referral_reward_campaigns(id,name,reward_type,reward_value,priority,starts_at,ends_at,referrer_ids) values(percent_id,'Percent fixture','percent',20,20,now()-interval '1 hour',now()+interval '1 hour',array[r]);
 o2:=pg_temp.reward_order(b,r);
 perform pg_temp.assert_true((select amount=300 from public.store_credit_ledger where order_id=o2 and type='earn'),'highest priority percent only, no stacking');
 update public.referral_reward_campaigns set ends_at=now()-interval '1 minute' where id=percent_id;
 update public.referral_reward_campaigns set referrer_ids=array[a] where id=fixed_id;
 o3:=pg_temp.reward_order(b,r);
 perform pg_temp.assert_true((select amount=100 from public.store_credit_ledger where order_id=o3 and type='earn'),'expired and nonmatching rewards excluded');
 perform pg_temp.assert_true(not exists(select 1 from public.referral_reward_snapshots where order_id=o3),'no unmatched snapshot');
 update public.referral_reward_campaigns set referrer_ids='{}',starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hours' where id=fixed_id;
 o4:=pg_temp.reward_order(b,r);
 perform pg_temp.assert_true((select amount=100 from public.store_credit_ledger where order_id=o4 and type='earn'),'future reward excluded');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',b)::text,true);
 refund:=(public.request_partial_refund(o2,500,'Reward reversal',gen_random_uuid())->>'id')::uuid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.complete_refund(a,o2,refund,'succeeded');
 perform public.complete_refund(a,o2,refund,'succeeded');
 perform pg_temp.assert_true((select sum(amount)=150 from public.store_credit_ledger where order_id=o2 and type='reverse'),'partial reverses base and bonus once');
 perform pg_temp.assert_true((select bonus_credit=200 from public.referral_reward_snapshots where order_id=o2),'original reward snapshot remains after changes');
 perform pg_temp.assert_true((select total=1000 from public.orders where id=o),'reward never discounts buyer amount');
end $$;
select 'PASS referral fixed/percent, priority, validity window, whitelist, snapshot, idempotency, partial refund' as result;
rollback;

