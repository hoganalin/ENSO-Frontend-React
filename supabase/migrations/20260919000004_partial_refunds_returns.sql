begin;
alter table public.refund_requests drop constraint if exists refund_requests_order_id_key;
alter table public.refund_requests add column if not exists request_key uuid;
create unique index if not exists refund_request_key on public.refund_requests(requested_by,request_key) where request_key is not null;
create or replace function public.request_partial_refund(p_order uuid,p_amount integer,p_reason text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; row public.refund_requests%rowtype; reserved bigint;
begin
 select * into ord from public.orders where id=p_order and buyer_id=auth.uid() for update;
 if not found then raise exception 'Order not found'; end if;
 select * into row from public.refund_requests where requested_by=auth.uid() and request_key=p_request_key;
 if found then
  if row.order_id<>p_order or row.amount<>p_amount or row.reason<>trim(p_reason) then raise exception 'Request key conflict'; end if;
  return to_jsonb(row);
 end if;
 if ord.status not in ('paid','shipped','completed') then raise exception 'Order cannot be refunded'; end if;
 if p_request_key is null or p_amount is null or p_amount<1 or coalesce(length(trim(p_reason)),0) not between 1 and 1000 then raise exception 'Invalid refund'; end if;
 select coalesce(sum(amount),0) into reserved from public.refund_requests where order_id=p_order and status<>'rejected';
 if p_amount+reserved>ord.total then raise exception 'Refund exceeds available balance'; end if;
 insert into public.refund_requests(order_id,requested_by,amount,reason,request_key) values(p_order,auth.uid(),p_amount,trim(p_reason),p_request_key) returning * into row;
 return to_jsonb(row);
end $$;
revoke all on function public.request_partial_refund(uuid,integer,text,uuid) from public,anon;
grant execute on function public.request_partial_refund(uuid,integer,text,uuid) to authenticated;
-- Retain the legacy RPC, with a stable key to make old clients safe to retry.
create or replace function public.request_refund(p_order uuid,p_amount integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin return public.request_partial_refund(p_order,p_amount,p_reason,p_order); end $$;
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
  for credit in select member_id,sum(amount)::bigint amount from public.store_credit_ledger where order_id=p_order and type='earn' group by member_id loop
   select coalesce(sum(amount),0) into reversed from public.store_credit_ledger where order_id=p_order and type='reverse' and member_id=credit.member_id;
   target:=floor(credit.amount::numeric*refunded/ord.total);
   if target>reversed then insert into public.store_credit_ledger(member_id,type,amount,order_id) values(credit.member_id,'reverse',target-reversed,p_order); end if;
  end loop;
  if refunded=ord.total then update public.orders set status='refunded' where id=p_order; end if;
 end if;
 update public.refund_requests set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),last_error=left(p_error,1000),reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_refund returning * into row;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'refund_'||p_status,p_order,jsonb_build_object('refund_id',p_refund,'amount',row.amount,'provider_reference',row.provider_reference));
 return to_jsonb(row);
end $$;
-- Returns are independent from financial refunds. Each receipt has one idempotency key.
create table if not exists public.return_receipts(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 order_item_id uuid not null references public.order_items(id),quantity integer not null check(quantity>0),
 request_key uuid not null unique,received_by uuid not null references public.profiles(id),
 note text not null check(length(trim(note)) between 1 and 1000),created_at timestamptz not null default now()
);
alter table public.return_receipts enable row level security;
grant select on public.return_receipts to authenticated;
grant all on public.return_receipts to service_role;
drop policy if exists return_receipts_read on public.return_receipts;
create policy return_receipts_read on public.return_receipts for select using(public.current_role() in ('admin','warehouse','finance','support') or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
create or replace function public.receive_order_return(p_actor uuid,p_order uuid,p_item uuid,p_quantity integer,p_request_key uuid,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; ord public.orders%rowtype; item public.order_items%rowtype; product public.products%rowtype; receipt public.return_receipts%rowtype; received bigint;
begin
 select role::text into actor_role from public.profiles where id=p_actor;
 if actor_role is null or actor_role not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 select * into receipt from public.return_receipts where request_key=p_request_key;
 if found then
  if receipt.order_id<>p_order or receipt.order_item_id<>p_item or receipt.quantity<>p_quantity or receipt.note<>trim(p_note) then raise exception 'Request key conflict'; end if;
  return to_jsonb(receipt);
 end if;
 if ord.shipped_at is null then raise exception 'Unshipped order has no stock to return'; end if;
 if p_request_key is null or p_quantity is null or p_quantity<1 or coalesce(length(trim(p_note)),0) not between 1 and 1000 then raise exception 'Invalid receipt'; end if;
 select * into item from public.order_items where id=p_item and order_id=p_order;
 if not found then raise exception 'Item not found'; end if;
 select coalesce(sum(quantity),0) into received from public.return_receipts where order_item_id=p_item;
 if received+p_quantity>item.qty then raise exception 'Return exceeds shipped quantity'; end if;
 select * into product from public.products where id=item.product_id for update;
 if not found then raise exception 'Product not found'; end if;
 update public.products set inventory=inventory+p_quantity where id=product.id;
 insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id) values(product.id,product.title,'add',p_quantity,product.inventory,product.inventory+p_quantity,'退貨驗收 '||ord.order_no||'：'||trim(p_note),p_actor);
 insert into public.return_receipts(order_id,order_item_id,quantity,request_key,received_by,note) values(p_order,p_item,p_quantity,p_request_key,p_actor,trim(p_note)) returning * into receipt;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'return_received',p_order,jsonb_build_object('receipt_id',receipt.id,'item_id',p_item,'quantity',p_quantity));
 return to_jsonb(receipt);
end $$;
revoke all on function public.receive_order_return(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.receive_order_return(uuid,uuid,uuid,integer,uuid,text) to service_role;
commit;
