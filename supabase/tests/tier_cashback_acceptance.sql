-- Apply after the pending tier migration. All fixtures and mutations roll back.
begin;
create function pg_temp.assert_tier(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
do $$
declare b uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); o uuid; trade text; tier text; expected integer; outcome jsonb; rejected boolean;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_user_meta_data) values(b,b||'@tier-test.invalid','{}'),(r,r||'@tier-test.invalid','{}');
 insert into public.profiles(id,role) values(b,'customer'),(r,'customer') on conflict(id) do update set role=excluded.role;
 insert into public.app_settings(key,value) values('silver_cashback_rate','10'),('gold_cashback_rate','20') on conflict(key) do update set value=excluded.value;
 update public.referral_reward_campaigns set is_active=false;
 foreach tier in array array['normal','silver','gold'] loop
  o:=gen_random_uuid(); trade:=left(replace(o::text,'-',''),20);
  insert into public.orders(id,buyer_id,referrer_id,referrer_tier_snapshot,total,subtotal,discount,shipping_fee,status)
   values(o,b,r,tier::public.member_tier,980,1000,100,80,'pending');
  insert into public.payment_transactions(order_id,merchant_trade_no,amount) values(o,trade,980);
  rejected:=false;
  begin perform public.settle_ecpay_payment(trade,'GATEWAY-'||trade,979,'Credit',true,'{}');
  exception when others then
   if sqlerrm='Amount mismatch' then rejected:=true; else raise; end if;
  end;
  perform pg_temp.assert_tier(rejected,'amount mismatch rejected');
  perform pg_temp.assert_tier((select status='pending' from public.orders where id=o),'mismatch does not settle order');
  outcome:=public.settle_ecpay_payment(trade,'',980,'Credit',false,'{}');
  perform pg_temp.assert_tier(outcome->>'outcome'='failed','failed callback is not paid');
  perform pg_temp.assert_tier((select status='pending' from public.orders where id=o),'failure preserves order');
  outcome:=public.settle_ecpay_payment(trade,'GATEWAY-'||trade,980,'Credit',true,'{}');
  expected:=case tier when 'silver' then 90 when 'gold' then 180 else 0 end;
  perform pg_temp.assert_tier(outcome->>'outcome'='settled' and (outcome->>'credit')::integer=expected,'correct tier net merchandise reward');
  perform pg_temp.assert_tier((select coalesce(sum(amount),0)=expected from public.store_credit_ledger where order_id=o and type='earn'),'ledger tier amount');
  outcome:=public.settle_ecpay_payment(trade,'GATEWAY-'||trade,980,'Credit',true,'{}');
  perform pg_temp.assert_tier(outcome->>'outcome'='duplicate','callback replay duplicate');
  perform pg_temp.assert_tier((select count(*)=case when expected=0 then 0 else 1 end from public.store_credit_ledger where order_id=o and type='earn'),'replay no extra credit');
  perform pg_temp.assert_tier((select status='paid' and settled_at is not null from public.payment_transactions where order_id=o),'transaction settled');
 end loop;
end $$;
select 'PASS tier rates, net merchandise reward, amount mismatch, failed callback and replay' as result;
rollback;

