-- Run once in the Supabase SQL Editor AFTER deploying the reminder endpoint.
-- Replace both values below. The secret must match CRON_SECRET in Vercel Production.
-- Do not use a Supabase service-role key here and do not commit real secrets.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $setup$
declare
  app_origin text := 'REPLACE_WITH_YOUR_HTTPS_APP_ORIGIN'; -- e.g. https://thekliniqueph.com
  cron_secret text := 'REPLACE_WITH_VERCEL_CRON_SECRET';
  secret_id uuid;
begin
  if app_origin !~ '^https://[^/?#]+$' or cron_secret = 'REPLACE_WITH_VERCEL_CRON_SECRET' or length(cron_secret) < 32 then
    raise exception 'Set your HTTPS app origin and the same CRON_SECRET (at least 32 characters) configured in Vercel Production.';
  end if;
  select id into secret_id from vault.secrets where name = 'klinique_reminder_origin';
  if secret_id is null then
    perform vault.create_secret(app_origin, 'klinique_reminder_origin', 'Production app origin for appointment reminders');
  else
    perform vault.update_secret(secret_id, app_origin);
  end if;
  select id into secret_id from vault.secrets where name = 'klinique_reminder_cron_secret';
  if secret_id is null then
    perform vault.create_secret(cron_secret, 'klinique_reminder_cron_secret', 'Bearer secret for the reminder endpoint');
  else
    perform vault.update_secret(secret_id, cron_secret);
  end if;
end;
$setup$;

-- A named schedule is updated in place on rerun; it does not create another job.
select cron.schedule('klinique-appointment-reminders', '* * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'klinique_reminder_origin') || '/api/notifications/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'klinique_reminder_cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
commit;

-- Check registration without exposing the secret:
select jobid, jobname, schedule, active from cron.job where jobname = 'klinique-appointment-reminders';

-- After one minute, inspect HTTP responses (200 is expected):
-- select status_code, timed_out, error_msg, created, content
-- from net._http_response order by created desc limit 10;
-- 401: Vault and Vercel CRON_SECRET do not match. 404: deploy the new code first.
-- To pause only this job:
-- update cron.job set active = false where jobname = 'klinique-appointment-reminders';
