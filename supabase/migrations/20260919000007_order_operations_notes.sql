begin;
create table if not exists public.order_notes (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 actor_id uuid not null references public.profiles(id), body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
alter table public.order_notes enable row level security;
revoke all on public.order_notes from anon,authenticated;
grant select,insert on public.order_notes to authenticated;
grant all on public.order_notes to service_role;
drop policy if exists order_notes_read on public.order_notes;
create policy order_notes_read on public.order_notes for select to authenticated
 using(public.current_role() in ('support','warehouse','finance','admin'));
drop policy if exists order_notes_write on public.order_notes;
create policy order_notes_write on public.order_notes for insert to authenticated
 with check(actor_id=auth.uid() and public.current_role() in ('support','admin'));
create table if not exists public.order_picking (
 order_id uuid primary key references public.orders(id), actor_id uuid not null references public.profiles(id),
 items jsonb not null, created_at timestamptz not null default now()
);
alter table public.order_picking enable row level security;
revoke all on public.order_picking from anon,authenticated;
grant select on public.order_picking to authenticated;
grant all on public.order_picking to service_role;
drop policy if exists order_picking_read on public.order_picking;
create policy order_picking_read on public.order_picking for select to authenticated
 using(public.current_role() in ('support','warehouse','finance','admin'));
create or replace function public.confirm_order_picking(p_order uuid) returns public.order_picking
 language plpgsql security definer set search_path=public as $$
 declare ord public.orders%rowtype; picked public.order_picking%rowtype; lines jsonb;
 begin
  if auth.uid() is null or coalesce(public.current_role()::text,'') not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
  select * into ord from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select * into picked from public.order_picking where order_id=p_order;
  if found then return picked; end if;
  if ord.status<>'paid' then raise exception 'Only paid orders may be picked'; end if;
  select jsonb_agg(jsonb_build_object('product_id',product_id,'title',title,'qty',qty) order by id)
   into lines from public.order_items where order_id=p_order;
  if lines is null then raise exception 'Order has no items'; end if;
  insert into public.order_picking(order_id,actor_id,items) values(p_order,auth.uid(),lines) returning * into picked;
  insert into public.operation_logs(actor_id,action,order_id,details) values(auth.uid(),'picking_confirmed',p_order,jsonb_build_object('items',lines));
  return picked;
 end $$;
revoke all on function public.confirm_order_picking(uuid) from public,anon;
grant execute on function public.confirm_order_picking(uuid) to authenticated;
commit;
