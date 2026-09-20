begin;
create or replace function public.create_mock_invoice(p_actor uuid,p_order uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; inv public.invoices%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role in ('admin','finance')) then raise exception 'Forbidden'; end if;
 select * into ord from public.orders where id=p_order for update;
 if not found or ord.status not in ('paid','shipped','completed') then raise exception 'Paid order required'; end if;
 select * into inv from public.invoices where order_id=p_order;
 if found then return to_jsonb(inv); end if;
 insert into public.invoices(order_id,provider,relate_number,invoice_number,amount,status,response_payload,issued_at)
 values(p_order,'mock','MOCK-'||p_order,'MOCK-'||left(p_order::text,8),ord.total,'issued','{"simulated":true}',now()) returning * into inv;
 insert into public.operation_logs(actor_id,action,order_id,details) values(p_actor,'mock_invoice_created',p_order,jsonb_build_object('invoice_id',inv.id));
 return to_jsonb(inv);
end $$;
revoke all on function public.create_mock_invoice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_mock_invoice(uuid,uuid) to service_role;

-- A mock void must never relabel an actual provider invoice as voided.
create or replace function public.guard_mock_invoice_void()
returns trigger language plpgsql as $$
begin
 if new.status='voided' and old.status<>'voided'
   and new.response_payload->>'provider_reference' like 'MOCK-%' and old.provider<>'mock' then
   raise exception 'Mock void only supports mock invoices';
 end if;
 return new;
end $$;
drop trigger if exists guard_mock_invoice_void on public.invoices;
create trigger guard_mock_invoice_void before update on public.invoices
for each row execute function public.guard_mock_invoice_void();
commit;
