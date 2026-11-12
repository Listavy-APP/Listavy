-- Production setup for the release flow. Already applied to project qmugoumizvtvuzndhosq.
-- Not run by the test suite. Run once per project, in order, as the postgres role.
-- The secret value is generated inside the database and never printed.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Shared secret between pg_cron and the release-payments function.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'release_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'release_secret',
      'Shared secret for the release-payments function, called by pg_cron');
  end if;
end $$;

create or replace function public.verify_release_secret(p_secret text)
returns boolean
language sql
security definer
set search_path to ''
as $$
  select p_secret is not null
     and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'release_secret' limit 1);
$$;

revoke execute on function public.verify_release_secret(text) from public, anon, authenticated;
grant execute on function public.verify_release_secret(text) to service_role;

-- Every 15 minutes. Idempotent: reschedule by unscheduling first if the job exists.
select cron.schedule(
  'release-payments',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/release-payments',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-release-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'release_secret' limit 1)),
    body := '{}'::jsonb
  );
  $cron$
);
