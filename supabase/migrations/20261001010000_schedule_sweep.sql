-- Calls the sweep function every 5 minutes.
--
-- The project URL and the sweep function's own key are read from Vault at run
-- time, so no secret is stored in this file. Create them once per project
-- (see SETUP.md, "Scheduled retries"):
--   nora_project_url   e.g. https://<project-ref>.supabase.co
--   nora_sweep_secret  same value as the SWEEP_SECRET function secret
-- Until both exist, the job runs and does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.run_sweep() returns void
language plpgsql security definer set search_path = public as $$
declare
  project_url text;
  sweep_secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'nora_project_url';
  select decrypted_secret into sweep_secret from vault.decrypted_secrets where name = 'nora_sweep_secret';
  if project_url is null or sweep_secret is null then
    raise log 'run_sweep: vault secrets nora_project_url / nora_sweep_secret are not set';
    return;
  end if;
  perform net.http_post(
    url := project_url || '/functions/v1/sweep',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sweep-secret', sweep_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.run_sweep() from public, anon, authenticated;

select cron.schedule('nora-sweep', '*/5 * * * *', 'select public.run_sweep()');
