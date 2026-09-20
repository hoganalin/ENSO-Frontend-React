-- ============================================================
-- ENSO 待補 migration · 第 4/7 段 （選用：定期配送排程，需先啟用 pg_cron / pg_net / supabase_vault）
-- 內含 1 支 migration，每支自帶 begin/commit，可安全重複執行
-- 在 Supabase SQL Editor 整段貼上按 Run；若出錯，修好後原樣重跑即可
-- ============================================================


-- ==== 20260919000003_scheduled_delivery.sql ====

begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Secrets are generated in PostgreSQL; no privileged Supabase API key enters cron.job.
do $$ begin
  if not exists (select 1 from vault.secrets where name='enso_delivery_cron_token') then
    perform vault.create_secret(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'enso_delivery_cron_token','Dedicated ENSO delivery scheduler token');
  end if;
end $$;

create or replace function public.validate_delivery_cron_token(p_token text)
returns boolean language sql security definer set search_path='' as $$
  select coalesce(length(p_token)=64 and p_token=(
    select decrypted_secret from vault.decrypted_secrets where name='enso_delivery_cron_token'
  ),false);
$$;

create or replace function public.invoke_scheduled_delivery()
returns bigint language plpgsql security definer set search_path='' as $$
declare project_url text; cron_token text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='enso_delivery_project_url';
  select decrypted_secret into cron_token from vault.decrypted_secrets where name='enso_delivery_cron_token';
  if project_url is null or cron_token is null then raise exception 'Delivery schedule is not configured'; end if;
  return net.http_post(url:=project_url || '/functions/v1/scheduled-delivery',
    headers:=jsonb_build_object('Content-Type','application/json','x-delivery-cron-token',cron_token),
    body:='{}'::jsonb, timeout_milliseconds:=120000);
end;
$$;

-- Called by deployment after the Edge Function exists. Safe to call more than once.
create or replace function public.configure_delivery_schedule(p_project_url text)
returns bigint language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if p_project_url is null or p_project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' then
    raise exception 'Expected a hosted Supabase project URL';
  end if;
  select id into secret_id from vault.secrets where name='enso_delivery_project_url';
  if secret_id is null then
    perform vault.create_secret(p_project_url,'enso_delivery_project_url');
  else
    perform vault.update_secret(secret_id,p_project_url);
  end if;
  return cron.schedule('enso-delivery-retry','* * * * *','select public.invoke_scheduled_delivery();');
end;
$$;

revoke all on function public.validate_delivery_cron_token(text) from public,anon,authenticated;
revoke all on function public.invoke_scheduled_delivery() from public,anon,authenticated;
revoke all on function public.configure_delivery_schedule(text) from public,anon,authenticated;
grant execute on function public.validate_delivery_cron_token(text) to service_role;
grant execute on function public.invoke_scheduled_delivery() to service_role;
grant execute on function public.configure_delivery_schedule(text) to service_role;
commit;
