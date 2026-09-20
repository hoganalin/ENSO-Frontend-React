begin;
create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  kind text not null check(kind in ('buyer_sms','referrer_sms','invoice')),
  status text not null default 'pending' check(status in ('pending','processing','sending','succeeded','failed','uncertain')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,kind)
);
alter table public.delivery_jobs enable row level security;
revoke all on public.delivery_jobs from anon,authenticated;
grant select on public.delivery_jobs to authenticated;
grant all on public.delivery_jobs to service_role;
drop policy if exists delivery_jobs_read on public.delivery_jobs;
create policy delivery_jobs_read on public.delivery_jobs for select
  using(public.current_role() in ('support','finance','admin'));

create or replace function public.enqueue_order_delivery() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.payment_gateway_trade_no is not null and old.payment_gateway_trade_no is null
    and new.status in ('paid','shipped','completed') then
    insert into public.delivery_jobs(order_id,kind) values(new.id,'buyer_sms'),(new.id,'invoice') on conflict do nothing;
    if new.referrer_id is not null then
      insert into public.delivery_jobs(order_id,kind) values(new.id,'referrer_sms') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enqueue_order_delivery on public.orders;
create trigger enqueue_order_delivery after update on public.orders
  for each row execute function public.enqueue_order_delivery();

create or replace function public.claim_delivery_jobs(p_limit integer default 10)
returns setof public.delivery_jobs language plpgsql security definer set search_path=public as $$
begin
  -- A crashed worker before sending is retryable; after sending, the result is unknown.
  update public.delivery_jobs set status=case when status='sending' then 'uncertain' else 'failed' end,
    last_error='Worker lease expired; reconcile unknown sends before retry', lease_token=null,lease_until=null,updated_at=now()
    where status in ('processing','sending') and lease_until < now();
  return query with picked as (
    select id from public.delivery_jobs where status in ('pending','failed') and attempts < 5
      and next_attempt_at <= now() order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,10),20))
  ) update public.delivery_jobs j set status='processing',attempts=j.attempts+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '5 minutes',updated_at=now() from picked where j.id=picked.id returning j.*;
end;
$$;

create or replace function public.transition_delivery_job(p_id uuid,p_token uuid,p_status text,p_error text default null,p_reference text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if p_status not in ('sending','succeeded','failed','uncertain') then raise exception 'Invalid job status'; end if;
  update public.delivery_jobs set status=p_status,last_error=left(p_error,1000),provider_reference=coalesce(p_reference,provider_reference),
    next_attempt_at=now()+interval '5 minutes',updated_at=now(),
    lease_until=case when p_status='sending' then now()+interval '5 minutes' else null end,
    lease_token=case when p_status='sending' then lease_token else null end
    where id=p_id and lease_token=p_token and lease_until>now()
      and ((status='processing' and p_status in ('sending','failed','succeeded'))
        or (status='sending' and p_status in ('succeeded','failed','uncertain')));
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function public.claim_delivery_jobs(integer) from public,anon,authenticated;
revoke all on function public.transition_delivery_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_delivery_jobs(integer) to service_role;
grant execute on function public.transition_delivery_job(uuid,uuid,text,text,text) to service_role;
commit;
