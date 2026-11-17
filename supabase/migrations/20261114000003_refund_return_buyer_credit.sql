-- 20261114000003_refund_return_buyer_credit.sql
-- 退款時退還買家已折抵的購物金（F1 後續）。
--   既有 complete_refund 已會「依比例回沖推薦人回饋金(earn→reverse)」。
--   這裡重發該函式，額外加上：依退款比例退還買家在該訂單花掉的購物金(ord.credit_used)。
--   退還用 earn + note='退款退還購物金' 標記、冪等；推薦人回沖改為只認 note is null 的系統發放，
--   避免把買家退還列誤當成要回收的回饋金。
--   比例 = credit_used × 已成功退款額 / 訂單總額（全退→全還，部分退→按比例）。
begin;

create or replace function public.complete_refund(p_actor uuid,p_order uuid,p_refund uuid,p_status text,p_provider_reference text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; row public.refund_requests%rowtype; ord public.orders%rowtype; refunded bigint; credit record; reversed bigint; target bigint;
begin
 select role::text into actor_role from public.profiles where id=p_actor;
 if actor_role is null or actor_role not in ('finance','admin') then raise exception 'Forbidden'; end if;
 if p_status is null or p_status not in ('succeeded','failed','uncertain','rejected') then raise exception 'Invalid refund result'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 select * into row from public.refund_requests where id=p_refund and order_id=p_order for update;
 if not found then raise exception 'Refund not found'; end if;
 if row.status='succeeded' then return to_jsonb(row); end if;
 if row.status='rejected' then raise exception 'Rejected refund'; end if;
 if row.status='uncertain' and p_status='rejected' then raise exception 'Resolve uncertain payment before rejection'; end if;
 if p_status='succeeded' then
  if ord.status not in ('paid','shipped','completed') then raise exception 'Order cannot be refunded'; end if;
  select coalesce(sum(amount),0)+row.amount into refunded from public.refund_requests where order_id=p_order and status='succeeded';
  if refunded>ord.total then raise exception 'Refund exceeds order total'; end if;
  -- 回沖推薦人回饋金（僅系統發放的 earn，note is null；排除買家退還列）
  for credit in select member_id,sum(amount)::bigint amount from public.store_credit_ledger where order_id=p_order and type='earn' and note is null group by member_id loop
   select coalesce(sum(amount),0) into reversed from public.store_credit_ledger where order_id=p_order and type='reverse' and member_id=credit.member_id;
   target:=floor(credit.amount::numeric*refunded/ord.total);
   if target>reversed then insert into public.store_credit_ledger(member_id,type,amount,order_id) values(credit.member_id,'reverse',target-reversed,p_order); end if;
  end loop;
  -- 退還買家已折抵的購物金（依退款比例；earn + note 標記，冪等）
  if coalesce(ord.credit_used,0) > 0 then
   target:=floor(ord.credit_used::numeric*refunded/ord.total);
   select coalesce(sum(amount),0) into reversed from public.store_credit_ledger where order_id=p_order and type='earn' and member_id=ord.buyer_id and note='退款退還購物金';
   if target>reversed then
    insert into public.store_credit_ledger(member_id,type,amount,order_id,created_at,expires_at,note)
      values(ord.buyer_id,'earn',target-reversed,p_order,now(),now()+interval '365 days','退款退還購物金');
   end if;
  end if;
  if refunded=ord.total then update public.orders set status='refunded' where id=p_order; end if;
 end if;
 update public.refund_requests set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),last_error=left(p_error,1000),reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_refund returning * into row;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'refund_'||p_status,p_order,jsonb_build_object('refund_id',p_refund,'amount',row.amount,'provider_reference',row.provider_reference));
 return to_jsonb(row);
end $$;

commit;
