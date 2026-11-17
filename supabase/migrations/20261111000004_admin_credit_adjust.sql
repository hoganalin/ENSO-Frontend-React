-- 20261111000004_admin_credit_adjust.sql
-- 後台「人工調整購物金」：admin/finance 可為會員加/減購物金，必填原因（審計）。
--   加額 → 記 'earn'（+，一年到期）；減額 → 記 'spend'（-，不可超過現有餘額）。
--   皆 order_id=null、帶 note。只有 admin/finance 可呼叫（經 edge function 以 service_role）。
begin;

alter table public.store_credit_ledger add column if not exists note text;

create or replace function public.admin_adjust_store_credit(
  p_actor uuid, p_member uuid, p_amount integer, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_balance bigint;
  v_abs integer;
  v_note text := trim(coalesce(p_note, ''));
begin
  if p_actor is null then raise exception 'Missing actor'; end if;
  select role::text into v_role from public.profiles where id = p_actor;
  if v_role is distinct from 'admin' and v_role is distinct from 'finance' then
    raise exception '只有管理員或財務可調整購物金'; end if;
  if p_member is null or not exists(select 1 from public.profiles where id = p_member) then
    raise exception '找不到該會員'; end if;
  if p_amount is null or p_amount = 0 then raise exception '調整金額不可為 0'; end if;
  if abs(p_amount) > 1000000 then raise exception '單次調整金額不可超過 NT$1,000,000'; end if;
  if length(v_note) < 2 or length(v_note) > 500 then raise exception '請填寫 2~500 字的調整原因'; end if;

  -- 鎖住該會員本列，序列化併發調整
  perform 1 from public.profiles where id = p_member for update;
  select coalesce(sum(case when type = 'earn' then amount else -amount end), 0)
    into v_balance from public.store_credit_ledger where member_id = p_member;

  if p_amount > 0 then
    insert into public.store_credit_ledger(member_id, type, amount, order_id, created_at, expires_at, note)
      values(p_member, 'earn', p_amount, null, now(), now() + interval '365 days', v_note);
    v_balance := v_balance + p_amount;
  else
    v_abs := -p_amount;
    if v_abs > v_balance then
      raise exception '扣除金額（NT$%）不可超過目前餘額（NT$%）', v_abs, v_balance; end if;
    insert into public.store_credit_ledger(member_id, type, amount, order_id, created_at, note)
      values(p_member, 'spend', v_abs, null, now(), v_note);
    v_balance := v_balance - v_abs;
  end if;
  return jsonb_build_object('member_id', p_member, 'balance', v_balance);
end;
$$;
revoke all on function public.admin_adjust_store_credit(uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.admin_adjust_store_credit(uuid,uuid,integer,text) to service_role;

commit;
