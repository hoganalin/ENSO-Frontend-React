begin;
-- Same-SKU exchanges ship only against an already inspected return receipt.
create table if not exists public.exchange_shipments(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 receipt_id uuid not null references public.return_receipts(id),quantity integer not null check(quantity>0),
 request_key uuid not null unique,tracking_number text not null check(length(trim(tracking_number)) between 1 and 100),
 shipped_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.exchange_shipments enable row level security;
grant select on public.exchange_shipments to authenticated;
grant all on public.exchange_shipments to service_role;
drop policy if exists exchange_shipments_read on public.exchange_shipments;
create policy exchange_shipments_read on public.exchange_shipments for select using(public.current_role() in ('admin','warehouse','finance','support') or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid()));
create or replace function public.ship_order_exchange(p_actor uuid,p_order uuid,p_receipt uuid,p_quantity integer,p_request_key uuid,p_tracking text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; ord public.orders%rowtype; receipt public.return_receipts%rowtype; item public.order_items%rowtype; product public.products%rowtype; shipment public.exchange_shipments%rowtype; shipped bigint;
begin
 select role::text into actor_role from public.profiles where id=p_actor;
 if actor_role is null or actor_role not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 select * into shipment from public.exchange_shipments where request_key=p_request_key;
 if found then
  if shipment.order_id<>p_order or shipment.receipt_id<>p_receipt or shipment.quantity<>p_quantity or shipment.tracking_number<>trim(p_tracking) then raise exception 'Request key conflict'; end if;
  return to_jsonb(shipment);
 end if;
 if p_request_key is null or p_quantity is null or p_quantity<1 or coalesce(length(trim(p_tracking)),0) not between 1 and 100 then raise exception 'Invalid shipment'; end if;
 if ord.status not in ('shipped','completed') then raise exception 'Order not eligible for exchange'; end if;
 -- Refunds and replacements cannot be awarded together for the same order.
 if exists(select 1 from public.refund_requests where order_id=p_order and status<>'rejected') then raise exception 'Resolve refund before exchange'; end if;
 select * into receipt from public.return_receipts where id=p_receipt and order_id=p_order;
 if not found then raise exception 'Return receipt not found'; end if;
 select coalesce(sum(quantity),0) into shipped from public.exchange_shipments where receipt_id=p_receipt;
 if shipped+p_quantity>receipt.quantity then raise exception 'Exchange exceeds received quantity'; end if;
 select * into item from public.order_items where id=receipt.order_item_id;
 select * into product from public.products where id=item.product_id for update;
 if not found or product.inventory<p_quantity then raise exception 'Insufficient inventory'; end if;
 update public.products set inventory=inventory-p_quantity where id=product.id;
 insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id) values(product.id,product.title,'subtract',p_quantity,product.inventory,product.inventory-p_quantity,'換貨重寄 '||ord.order_no||'：'||trim(p_tracking),p_actor);
 insert into public.exchange_shipments(order_id,receipt_id,quantity,request_key,tracking_number,shipped_by) values(p_order,p_receipt,p_quantity,p_request_key,trim(p_tracking),p_actor) returning * into shipment;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'exchange_shipped',p_order,jsonb_build_object('shipment_id',shipment.id,'receipt_id',p_receipt,'quantity',p_quantity,'tracking',trim(p_tracking)));
 return to_jsonb(shipment);
end $$;
revoke all on function public.ship_order_exchange(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.ship_order_exchange(uuid,uuid,uuid,integer,uuid,text) to service_role;
-- Do not accept an independent refund for an order whose goods were replaced.
create or replace function public.guard_refund_after_exchange() returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from public.orders where id=new.order_id for update;
 if exists(select 1 from public.exchange_shipments where order_id=new.order_id) then raise exception 'Exchange already shipped; contact support'; end if;
 return new;
end $$;
drop trigger if exists guard_refund_after_exchange on public.refund_requests;
create trigger guard_refund_after_exchange before insert on public.refund_requests for each row execute function public.guard_refund_after_exchange();
commit;
