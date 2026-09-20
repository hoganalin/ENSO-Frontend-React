begin;

-- Testable, audited after-sales operations. Provider calls remain outside this
-- migration; the Edge Function supplies a mock provider reference in test mode.
create or replace function public.complete_refund(
  p_actor uuid, p_order uuid, p_refund uuid, p_status text, p_provider_reference text default null, p_error text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; row public.refund_requests%rowtype; ord public.orders%rowtype;
begin
  select role::text into actor_role from public.profiles where id=p_actor;
  if actor_role is null or actor_role not in ('finance','admin') then raise exception 'Forbidden'; end if;
  if p_status not in ('succeeded','failed','uncertain') then raise exception 'Invalid refund result'; end if;
  select * into row from public.refund_requests where id=p_refund for update;
  if not found then raise exception 'Refund not found'; end if;
  if row.order_id <> p_order then raise exception 'Order mismatch'; end if;
  if row.status='succeeded' then return to_jsonb(row); end if;
  if row.status='rejected' then raise exception 'Rejected refund'; end if;
  select * into ord from public.orders where id=row.order_id for update;
  if row.amount <> ord.total then raise exception 'Only full refunds supported'; end if;
  if p_status='succeeded' then
    if ord.status not in ('paid','shipped','completed','refunded') then raise exception 'Order cannot be refunded'; end if;
    insert into public.store_credit_ledger(member_id,type,amount,order_id)
      select member_id,'reverse',sum(amount),ord.id from public.store_credit_ledger
      where order_id=ord.id and type='earn' and not exists (select 1 from public.store_credit_ledger where order_id=ord.id and type='reverse') group by member_id;
    update public.orders set status='refunded' where id=ord.id and status <> 'refunded';
  end if;
  update public.refund_requests set status=p_status, provider_reference=coalesce(p_provider_reference,provider_reference),
    last_error=case when p_error is null then null else left(p_error,1000) end,
    reviewed_by=p_actor, reviewed_at=now(), updated_at=now() where id=row.id returning * into row;
  insert into public.operation_logs(actor_id,action,order_id,details)
    values(p_actor,'refund_'||p_status,row.order_id,jsonb_build_object('amount',row.amount,'provider_reference',row.provider_reference,'error',row.last_error));
  return to_jsonb(row);
end;
$$;
revoke all on function public.complete_refund(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_refund(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.void_invoice(p_actor uuid, p_order uuid, p_invoice uuid, p_provider_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; row public.invoices%rowtype;
begin
  select role::text into actor_role from public.profiles where id=p_actor;
  if actor_role is null or actor_role not in ('finance','admin') then raise exception 'Forbidden'; end if;
  select * into row from public.invoices where id=p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if row.order_id <> p_order then raise exception 'Order mismatch'; end if;
  if row.status='voided' then return to_jsonb(row); end if;
  if row.status <> 'issued' then raise exception 'Only issued invoices can be voided'; end if;
  update public.invoices set status='voided', error_message=null, response_payload=jsonb_build_object('voided',true,'provider_reference',p_provider_reference), updated_at=now() where id=row.id returning * into row;
  insert into public.operation_logs(actor_id,action,order_id,details)
    values(p_actor,'invoice_voided',row.order_id,jsonb_build_object('invoice_id',row.id,'invoice_number',row.invoice_number,'provider_reference',p_provider_reference));
  return to_jsonb(row);
end;
$$;
revoke all on function public.void_invoice(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_invoice(uuid,uuid,uuid,text) to service_role;
commit;
