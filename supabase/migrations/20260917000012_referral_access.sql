begin;
create or replace function public.can_view_referrals() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select role='referral_partner' or member_tier in ('silver','gold') from public.profiles where id=auth.uid()),false)
$$;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (
  buyer_id=auth.uid() or public.is_staff() or
  (public.can_view_referrals() and referrer_id=auth.uid())
);
drop policy if exists items_read on public.order_items;
create policy items_read on public.order_items for select using (
  exists(select 1 from public.orders o where o.id=order_id and
    (o.buyer_id=auth.uid() or public.is_staff() or (public.can_view_referrals() and o.referrer_id=auth.uid())))
);
commit;
