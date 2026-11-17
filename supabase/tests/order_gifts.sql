begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.must_fail(statement text) returns void language plpgsql as $$ declare failed boolean:=false; begin begin execute statement; exception when others then failed:=true; end; perform pg_temp.assert_true(failed,'Expected rejection: '||statement); end $$;
do $$
declare b uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); promo uuid:=gen_random_uuid(); textpromo uuid:=gen_random_uuid(); picked public.order_picking;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_user_meta_data) values(b,b||'@acceptance.invalid','{}'),(w,w||'@acceptance.invalid','{}');
 insert into public.profiles(id,role) values(b,'customer'),(w,'warehouse') on conflict(id) do update set role=excluded.role;
 insert into public.products(id,title,price,inventory) values(p,'Purchased fixture',1000,10),(g,'Gift fixture',100,5);
 insert into public.promotions(id,name,promo_group,is_auto,conditions,effect) values
 (promo,'Gift campaign','gift',true,'{"min_subtotal":1000}',jsonb_build_object('gift','Gift fixture','gift_qty',2,'gift_product_id',g)),
 (textpromo,'Legacy gift','gift',true,'{}','{"gift":"Gift wrapping"}');
 insert into public.orders(id,buyer_id,total,subtotal,status,applied_promos) values(o,b,1000,1000,'paid',jsonb_build_array(jsonb_build_object('id',promo,'gift','Gift fixture'),jsonb_build_object('id',textpromo,'gift','Gift wrapping')));
 insert into public.order_items(order_id,product_id,title,unit_price,qty) values(o,p,'Purchased fixture',1000,1);
 perform pg_temp.assert_true((select count(*)=2 and sum(qty)=3 from public.order_gifts where order_id=o),'tracked and legacy gift snapshots');
 update public.promotions set effect='{"gift":"Changed gift","gift_qty":9}' where id=promo;
 perform pg_temp.assert_true((select title='Gift fixture' and qty=2 and product_id=g from public.order_gifts where order_id=o and promotion_id=promo),'snapshot immutable when promotion changes');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',w)::text,true);
 picked:=public.confirm_order_picking(o);
 perform pg_temp.assert_true(jsonb_array_length(picked.items)=3,'picking includes paid item and both gifts');
 perform public.confirm_order_picking(o);
 perform pg_temp.assert_true((select count(*)=1 from public.order_picking where order_id=o),'picking idempotent');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update public.products set inventory=1 where id=g;
 perform pg_temp.must_fail(format('select public.admin_order_action(%L,%L,''ship'',null,''GIFT-SHIP'')',w,o));
 perform pg_temp.assert_true((select inventory=10 from public.products where id=p),'gift shortage rolls back purchased stock');
 perform pg_temp.assert_true((select status='paid' from public.orders where id=o),'gift shortage leaves order unshipped');
 update public.products set inventory=5 where id=g;
 perform public.admin_order_action(w,o,'ship',null,'GIFT-SHIP');
 perform public.admin_order_action(w,o,'ship',null,'GIFT-SHIP');
 perform pg_temp.assert_true((select inventory=3 from public.products where id=g),'gift stock deducted exactly once');
 perform pg_temp.assert_true((select inventory=9 from public.products where id=p),'purchased stock deducted once');
 perform pg_temp.assert_true((select total=1000 from public.orders where id=o),'gift does not change charged total');
end $$;
select 'PASS gift snapshot, legacy gift, picking, stock shortage atomicity, shipment idempotency' as result;
rollback;
