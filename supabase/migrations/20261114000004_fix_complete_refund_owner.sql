-- 20261114000004_fix_complete_refund_owner.sql
-- 修正既有問題：complete_refund 為 security definer，但其擁有者角色對 orders / store_credit_ledger
--   等表無足夠權限(且無法繞過 RLS)，導致執行退款時 'permission denied for table orders'
--   (此 DB 從未成功完成任何退款)。
-- 做法：DROP 後重新 CREATE —— 重新建立時擁有者=部署角色(postgres，具 BYPASSRLS 與表權限，
--   與可正常運作的 settle_ecpay_payment 同類)。函式內容含 F1 的買家購物金退還邏輯。
begin;

drop function if exists public.complete_refund(uuid,uuid,uuid,text,text,text);

create function public.complete_refund(p_actor uuid,p_order uuid,p_refund uuid,p_status text,p_provider_reference text default null,p_error text default null)
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
  for credit in select member_id,sum(amount)::bigint amount from public.store_credit_ledger where order_id=p_order and type='earn' and note is null group by member_id loop
   select coalesce(sum(amount),0) into reversed from public.store_credit_ledger where order_id=p_order and type='reverse' and member_id=credit.member_id;
   target:=floor(credit.amount::numeric*refunded/ord.total);
   if target>reversed then insert into public.store_credit_ledger(member_id,type,amount,order_id) values(credit.member_id,'reverse',target-reversed,p_order); end if;
  end loop;
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

revoke all on function public.complete_refund(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_refund(uuid,uuid,uuid,text,text,text) to service_role;

commit;
