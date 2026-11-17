begin;
do $$
declare actors uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 roles text[]:=array['customer','support','warehouse']; o uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); i int; denied boolean; n int;
begin
 for i in 1..3 loop
  insert into auth.users(id,email,raw_user_meta_data) values(actors[i],actors[i]::text||'@operations.invalid','{}');
  insert into public.profiles(id,role) values(actors[i],roles[i]::public.user_role) on conflict(id) do update set role=excluded.role;
 end loop;
 insert into public.products(id,title,price,inventory) values(p,'QA picking',100,10);
 insert into public.orders(id,buyer_id,total,subtotal,status) values(o,actors[1],100,100,'paid');
 insert into public.order_items(order_id,product_id,title,unit_price,qty) values(o,p,'QA picking',100,1);
 for i in 1..3 loop
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actors[i])::text,true);
  set local role authenticated;
  denied:=false;
  begin insert into public.order_notes(order_id,actor_id,body) values(o,actors[i],'QA note'); exception when insufficient_privilege then denied:=true; end;
  if denied<>(i<>2) then raise exception 'Note authorization failed'; end if;
  denied:=false;
  begin perform public.confirm_order_picking(o); exception when others then if SQLERRM='Forbidden' then denied:=true; else raise; end if; end;
  if denied<>(i<>3) then raise exception 'Picking authorization failed'; end if;
  if i=3 then perform public.confirm_order_picking(o); end if;
  reset role;
 end loop;
 select count(*) into n from public.order_picking where order_id=o;
 if n<>1 then raise exception 'Picking replay duplicated'; end if;
 select count(*) into n from public.operation_logs where order_id=o and action='picking_confirmed';
 if n<>1 then raise exception 'Picking audit duplicated'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actors[1])::text,true);
 set local role authenticated;
 select count(*) into n from public.order_notes where order_id=o;
 if n<>0 then raise exception 'Customer can see internal notes'; end if;
 reset role;
end $$;
select 'PASS: internal notes permissions, customer isolation, picking permissions and idempotency' as result;
rollback;
