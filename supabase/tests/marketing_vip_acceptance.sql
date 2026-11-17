-- Transaction-only fixtures. Publishes no real SMS and rolls back all inbox messages.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create temporary table marketing_fixture(marketer uuid,buyer uuid,vip uuid,campaign uuid,product uuid,ord uuid);
insert into marketing_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on marketing_fixture to authenticated;
do $$
declare f marketing_fixture%rowtype; outcome jsonb; rejected boolean;
begin
 select * into f from marketing_fixture;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_user_meta_data)
 select x,x::text||'@marketing-test.invalid','{}' from unnest(array[f.marketer,f.buyer,f.vip]) x;
 insert into public.profiles(id,role,member_tier) values(f.marketer,'marketing','normal'),(f.buyer,'customer','normal'),(f.vip,'customer','gold')
 on conflict(id) do update set role=excluded.role,member_tier=excluded.member_tier;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f.marketer)::text,true);
 outcome:=public.publish_member_message(f.campaign,'gold','VIP acceptance','Rollback-only test message');
 perform pg_temp.assert_true(exists(select 1 from public.member_messages where campaign_id=f.campaign and member_id=f.vip),'VIP receives inbox message');
 perform pg_temp.assert_true(not exists(select 1 from public.member_messages where campaign_id=f.campaign and member_id=f.buyer),'normal is excluded');
 perform pg_temp.assert_true(public.publish_member_message(f.campaign,'gold','VIP acceptance','Rollback-only test message')=outcome,'request replay is idempotent');
 perform pg_temp.assert_true((select count(*)=1 from public.member_messages where campaign_id=f.campaign and member_id=f.vip),'no duplicate message');
 rejected:=false;
 begin perform public.publish_member_message(f.campaign,'normal','changed','changed'); exception when others then rejected:=true; end;
 perform pg_temp.assert_true(rejected,'changed replay rejected');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f.buyer)::text,true);
 rejected:=false;
 begin perform public.publish_member_message(gen_random_uuid(),'all','bad','bad'); exception when others then rejected:=true; end;
 perform pg_temp.assert_true(rejected,'customer cannot publish');
 rejected:=false;
 begin perform public.marketing_segment_members('all'); exception when others then rejected:=true; end;
 perform pg_temp.assert_true(rejected,'customer cannot inspect segments');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.products(id,title,price,is_enabled,vip_only,inventory) values(f.product,'VIP acceptance',100,true,true,100);
 insert into public.orders(id,buyer_id,total,subtotal,status) values(f.ord,f.buyer,100,100,'pending');
 rejected:=false;
 begin insert into public.order_items(order_id,product_id,title,unit_price,qty) values(f.ord,f.product,'VIP acceptance',100,1);
 exception when others then rejected:=true; end;
 perform pg_temp.assert_true(rejected,'database refuses non VIP order item');
 update public.orders set buyer_id=f.vip where id=f.ord;
 insert into public.order_items(order_id,product_id,title,unit_price,qty) values(f.ord,f.product,'VIP acceptance',100,1);
 update public.products set available_at=now()+interval '2 days',vip_available_at=now()+interval '1 day' where id=f.product;
 rejected:=false;
 begin insert into public.order_items(order_id,product_id,title,unit_price,qty) values(f.ord,f.product,'VIP acceptance',100,1);
 exception when others then rejected:=true; end;
 perform pg_temp.assert_true(rejected,'database refuses early VIP purchase before opening');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f.vip)::text,true);
end $$;
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.member_messages where campaign_id=(select campaign from marketing_fixture)),'VIP reads own inbox');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select buyer from marketing_fixture))::text,true);
select pg_temp.assert_true((select count(*)=0 from public.member_messages where campaign_id=(select campaign from marketing_fixture)),'RLS hides other member inbox');
reset role;
select 'PASS: marketing authorization, segmentation, idempotency, inbox RLS, VIP product transaction checks' as result;
rollback;
