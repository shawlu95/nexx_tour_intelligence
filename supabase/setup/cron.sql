-- Schedules the retry sweeper every 5 minutes.
-- Run once in the Supabase SQL editor after deploying the functions.
-- Replace the two placeholders first; they are stored encrypted in Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'nora_project_url');
select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'nora_service_role_key');

select cron.schedule(
  'nora-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nora_project_url') || '/functions/v1/sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nora_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
