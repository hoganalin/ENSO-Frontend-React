begin;
create or replace function public.guard_membership_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if row(new.subscription_active,new.subscription_started_at,new.subscription_expires_at,new.distributor_discount_rate)
    is distinct from row(old.subscription_active,old.subscription_started_at,old.subscription_expires_at,old.distributor_discount_rate)
    and coalesce(public.current_role()::text,'') <> 'admin'
    and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Only administrators can change membership benefits';
  end if;
  return new;
end $$;
create or replace function public.renew_subscription(p_profile uuid,p_days integer,p_request uuid)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare member public.profiles%rowtype; previous public.subscription_changes%rowtype;
 actor uuid := auth.uid(); expiry timestamptz;
begin
 if actor is null or coalesce(public.current_role()::text,'') <> 'admin' then raise exception 'Forbidden'; end if;
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
commit;

