begin;

-- Centralise policy checks so clients cannot grant themselves distributor benefits.
create or replace function public.has_active_subscription(p_profile uuid, p_at timestamptz default now())
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select subscription_active
    and (subscription_expires_at is null or subscription_expires_at > p_at)
    from public.profiles where id = p_profile), false)
$$;

create or replace function public.distributor_discount(p_profile uuid, p_subtotal integer, p_at timestamptz default now())
returns integer language plpgsql stable security definer set search_path=public as $$
declare rate numeric;
begin
  if p_subtotal is null or p_subtotal < 0 then raise exception 'Invalid subtotal'; end if;
  select distributor_discount_rate into rate from public.profiles
    where id=p_profile and role='distributor'
      and subscription_active and (subscription_expires_at is null or subscription_expires_at > p_at);
  if not found then return 0; end if;
  return least(p_subtotal, floor(p_subtotal * greatest(0, least(coalesce(rate,0),100)) / 100)::integer);
end;
$$;
revoke all on function public.has_active_subscription(uuid,timestamptz) from public, anon;
revoke all on function public.distributor_discount(uuid,integer,timestamptz) from public, anon;
grant execute on function public.has_active_subscription(uuid,timestamptz) to authenticated, service_role;
grant execute on function public.distributor_discount(uuid,integer,timestamptz) to authenticated, service_role;
-- Subscription settings are privileged, even when a buyer can update their profile.
create or replace function public.guard_membership_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.subscription_active,new.subscription_started_at,new.subscription_expires_at,new.distributor_discount_rate)
    is distinct from row(old.subscription_active,old.subscription_started_at,old.subscription_expires_at,old.distributor_discount_rate)
    and coalesce(public.current_role(),'') <> 'admin'
    and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Only administrators can change membership benefits';
  end if;
  return new;
end $$;
drop trigger if exists guard_membership_privileges on public.profiles;
create trigger guard_membership_privileges before update on public.profiles
for each row execute function public.guard_membership_privileges();

create table if not exists public.subscription_changes (
 request_id uuid primary key, profile_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id), days integer not null check(days between 1 and 366),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
alter table public.subscription_changes enable row level security;
grant select on public.subscription_changes to authenticated;
grant all on public.subscription_changes to service_role;
drop policy if exists subscription_changes_read on public.subscription_changes;
create policy subscription_changes_read on public.subscription_changes for select to authenticated
using(profile_id=auth.uid() or public.current_role()='admin');

-- Admin test-mode activation/renewal. Retrying request_id never extends twice.
-- Active finite subscriptions extend from expiry; expired/disabled restart now.
create or replace function public.renew_subscription(p_profile uuid,p_days integer,p_request uuid)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare member public.profiles%rowtype; previous public.subscription_changes%rowtype;
 actor uuid := auth.uid(); expiry timestamptz;
begin
 if actor is null or coalesce(public.current_role(),'') <> 'admin' then raise exception 'Forbidden'; end if;
 if p_days is null or p_days not between 1 and 366 or p_request is null then raise exception 'Invalid renewal'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,1));
 select * into previous from public.subscription_changes where request_id=p_request;
 if found then
   if previous.profile_id<>p_profile or previous.days<>p_days then raise exception 'Renewal request conflict'; end if;
   return previous.expires_at;
 end if;
 select * into strict member from public.profiles where id=p_profile for update;
 if member.subscription_active and member.subscription_expires_at is null then
   raise exception 'Lifetime subscription does not require renewal';
 end if;
 expiry := (case when member.subscription_active then greatest(now(),member.subscription_expires_at) else now() end)
   + make_interval(days=>p_days);
 update public.profiles set subscription_active=true,
   subscription_started_at=case when member.subscription_active and member.subscription_expires_at>now()
      then coalesce(member.subscription_started_at,now()) else now() end,
   subscription_expires_at=expiry where id=p_profile;
 insert into public.subscription_changes(request_id,profile_id,actor_id,days,expires_at)
 values(p_request,p_profile,actor,p_days,expiry);
 insert into public.operation_logs(actor_id,action,details)
 values(actor,'subscription_renewed',jsonb_build_object('profile_id',p_profile,'days',p_days,'expires_at',expiry,'request_id',p_request));
 return expiry;
end $$;
revoke all on function public.renew_subscription(uuid,integer,uuid) from public,anon;
grant execute on function public.renew_subscription(uuid,integer,uuid) to authenticated;
commit;

