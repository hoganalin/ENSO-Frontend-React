begin;
create or replace function public.adjust_inventory(p_product uuid,p_delta integer,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); role_name text; product public.products%rowtype; after_qty bigint;
begin
  select role::text into role_name from public.profiles where id=actor for share;
  if role_name is null or role_name not in ('warehouse','admin') then raise exception 'Forbidden'; end if;
  if p_delta is null or p_delta=0 or abs(p_delta::bigint)>1000000 or coalesce(length(trim(p_note)),0) not between 1 and 500 then raise exception 'Invalid adjustment'; end if;
  select * into product from public.products where id=p_product for update;
  if not found then raise exception 'Product not found'; end if;
  after_qty := product.inventory::bigint+p_delta;
  if after_qty < 0 or after_qty>2147483647 then raise exception 'Invalid stock balance'; end if;
  update public.products set inventory=after_qty where id=p_product;
  insert into public.inventory_logs(product_id,product_title,type,quantity,before_qty,after_qty,note,operator_id)
    values(p_product,product.title,case when p_delta>0 then 'add'::public.inventory_tx_type else 'subtract'::public.inventory_tx_type end,
      abs(p_delta),product.inventory,after_qty,trim(p_note),actor);
  return jsonb_build_object('inventory',after_qty);
end;
$$;
revoke all on function public.adjust_inventory(uuid,integer,text) from public,anon;
grant execute on function public.adjust_inventory(uuid,integer,text) to authenticated;
-- History must be written by an atomic stock operation, not independently by a browser.
revoke insert,update,delete on public.inventory_logs from anon,authenticated;
commit;
