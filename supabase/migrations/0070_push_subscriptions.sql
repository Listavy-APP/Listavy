-- 0070: Web Push for admins (Phase B). NOT APPLIED. Pending Sam's review and Fabian's approval.
--
-- Parts:
--   1. push_subscriptions: one row per browser/device a user enabled push on.
--   2. notify_admins(): posts to the send-push edge function via pg_net. It never raises,
--      so a push failure cannot block the business write that fired it.
--   3. Triggers for the five admin events. Each fires on the row write itself.
--
-- Requires: vault secret 'push_secret' (same value as the send-push function's PUSH_SECRET).
-- If the secret is missing, notify_admins() is a no-op.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions for select
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions for insert
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions for delete
  using (user_id = (select auth.uid()));

-- 1b. Notify every admin. Fire-and-forget via pg_net.
create or replace function public.notify_admins(p_title text, p_body text, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
  if v_secret is null then return; end if;

  perform net.http_post(
    url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url)
  );
exception when others then
  -- Never block the business write. A failed push is only a missed notification.
  return;
end;
$$;

revoke execute on function public.notify_admins(text, text, text) from public, anon, authenticated;

-- 2. Triggers. Each is AFTER, so it runs only once the row is written.

-- (1) New dispute filed.
create or replace function public.push_on_dispute_filed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_admins('Nueva disputa', 'Se abrió una disputa en un trabajo.', '/admin/disputas');
  return new;
end; $$;

drop trigger if exists push_dispute_filed on public.disputes;
create trigger push_dispute_filed after insert on public.disputes
  for each row execute function public.push_on_dispute_filed();

-- (2) Job problem flag raised at check-in.
create or replace function public.push_on_job_problem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_admins('Problema en un trabajo', 'Un cliente o profesional reportó un problema.', '/admin');
  return new;
end; $$;

drop trigger if exists push_job_problem on public.job_notifications;
create trigger push_job_problem after update of problem_reported_at on public.job_notifications
  for each row when (new.problem_reported_at is not null and old.problem_reported_at is null)
  execute function public.push_on_job_problem();

-- (3) Pro reported.
create or replace function public.push_on_pro_reported() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_admins('Profesional reportado', 'Un cliente reportó a un profesional.', '/admin/pagos');
  return new;
end; $$;

drop trigger if exists push_pro_reported on public.pro_reports;
create trigger push_pro_reported after insert on public.pro_reports
  for each row execute function public.push_on_pro_reported();

-- (4) Review auto-hidden for language. Only the automatic flag, not admin hides.
create or replace function public.push_on_review_hidden() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_admins('Reseña oculta por lenguaje', 'Una reseña necesita revisión.', '/admin/resenas');
  return new;
end; $$;

drop trigger if exists push_review_hidden on public.reviews;
create trigger push_review_hidden after insert or update of status on public.reviews
  for each row when (new.status = 'hidden' and new.flag_reasons @> array['lenguaje']::text[]
                     and (tg_op = 'INSERT' or old.status is distinct from 'hidden'))
  execute function public.push_on_review_hidden();

-- (5) New pro application submitted.
create or replace function public.push_on_pro_application() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_admins('Nueva solicitud de profesional', 'Hay una solicitud pendiente de aprobación.', '/admin');
  return new;
end; $$;

drop trigger if exists push_pro_application on public.pros;
create trigger push_pro_application after insert on public.pros
  for each row when (new.verification_status = 'pending')
  execute function public.push_on_pro_application();
