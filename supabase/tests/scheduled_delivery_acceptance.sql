-- Run through a trusted database connection after migration; all changes roll back.
-- Does NOT invoke HTTP or send SMS. Never select Vault plaintext in output.
begin;
do $$
declare token text; jid bigint;
begin
  if has_function_privilege('anon','public.validate_delivery_cron_token(text)','EXECUTE')
    or has_function_privilege('authenticated','public.configure_delivery_schedule(text)','EXECUTE')
    or has_function_privilege('authenticated','public.invoke_scheduled_delivery()','EXECUTE') then
    raise exception 'Cron functions must not be available to browser roles';
  end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='enso_delivery_cron_token';
  if not public.validate_delivery_cron_token(token)
    or public.validate_delivery_cron_token('invalid')
    or public.validate_delivery_cron_token(null) then
    raise exception 'Cron token validation failed';
  end if;
  jid := public.configure_delivery_schedule('https://aaaaaaaaaaaaaaaaaaaa.supabase.co');
  if jid <> public.configure_delivery_schedule('https://aaaaaaaaaaaaaaaaaaaa.supabase.co') then
    raise exception 'Schedule configuration is not idempotent';
  end if;
  if not exists(select 1 from cron.job where jobid=jid and active and schedule='* * * * *'
    and command='select public.invoke_scheduled_delivery();') then
    raise exception 'Schedule is missing or exposes unexpected command';
  end if;
end $$;
select 'PASS: cron permissions, private token validation, idempotent schedule, no secret in command' as result;
rollback;
