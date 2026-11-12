-- Refund processor schedule. Run once per project after migration 0018.
-- Reuses the release_secret in Vault (see release_flow_setup.sql). Not run by tests.
-- Staggered to minutes 7, 22, 37, 52 so it does not run in the same minute as release-payments.

select cron.schedule(
  'process-refunds',
  '7,22,37,52 * * * *',
  $cron$
  select net.http_post(
    url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/process-refunds',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-release-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'release_secret' limit 1)),
    body := '{}'::jsonb
  );
  $cron$
);
