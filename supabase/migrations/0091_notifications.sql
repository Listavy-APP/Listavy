-- 0091 · Notifications (build queue item 5a): per-user push, preferences, transactional email, send log.
-- STATUS: NOT APPLIED. Sam reviews on the branch, Fabian gives the apply go, then it is applied and verified.
--
-- Builds on 0070 (push_subscriptions, verify_push_secret, vault 'push_secret').
-- Rules:
--   * Every trigger fires on a real transition (OLD distinct from NEW, or the creating insert).
--     Re-saving a row never re-notifies.
--   * A send never blocks or fails the business write. Every pg_net call sits in an exception block.
--   * Email goes only to profiles with email_verified_at set. This is checked here and again in send-email.
--   * Job-event push and email follow the user's preferences (default ON). The receipt, the dispute
--     emails, and the welcome email always send.
--
-- Parts:
--   1. notification_preferences (owner-only RLS). A missing row means both toggles are ON.
--   2. notification_log (no user policy; admin reads through a definer function).
--   3. notify_user_push / notify_user_email: the only senders. They post to the edge functions.
--   4. Transition triggers for each event in the matrix.

-- ---------------------------------------------------------------------------
-- 1. Preferences
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  job_push    boolean not null default true,
  job_email   boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_owner_select on public.notification_preferences for select
  using (user_id = (select auth.uid()));
create policy notification_preferences_owner_insert on public.notification_preferences for insert
  with check (user_id = (select auth.uid()));
create policy notification_preferences_owner_update on public.notification_preferences for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notification_preferences from anon;

-- ---------------------------------------------------------------------------
-- 2. Send log
-- ---------------------------------------------------------------------------
-- One row per attempted send, including skips. Status values:
--   sent, failed, no_subscription (push), skipped_preference, skipped_unverified (email).
-- detail never holds an endpoint URL (it is a credential). Failures carry subscription id, status, message.
create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  channel     text not null check (channel in ('push', 'email')),
  kind        text not null,
  status      text not null check (status in ('sent', 'failed', 'no_subscription', 'skipped_preference', 'skipped_unverified')),
  detail      text,
  created_at  timestamptz not null default now()
);

create index notification_log_user_idx on public.notification_log (user_id, created_at desc);

alter table public.notification_log enable row level security;
-- No policies: no user or anon role reads or writes the log. Edge functions use the service role.
revoke all on public.notification_log from anon, authenticated;

-- Admin read. Same is_admin() gate as the other admin tools (aal2).
create or replace function public.admin_notification_log(p_user uuid, p_limit integer default 50)
returns setof public.notification_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede ver el registro.'; end if;
  return query
    select * from public.notification_log
     where user_id = p_user
     order by created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke execute on function public.admin_notification_log(uuid, integer) from public, anon;
grant execute on function public.admin_notification_log(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Senders
-- ---------------------------------------------------------------------------

-- Push to one user. Posts to send-push with user_id. send-push fans out to that user's devices.
create or replace function public.notify_user_push(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_always boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_on boolean;
begin
  if p_user is null then return; end if;
  begin
    select p.job_push into v_on from public.notification_preferences p where p.user_id = p_user;
    v_on := coalesce(v_on, true);
    if not p_always and not v_on then
      insert into public.notification_log (user_id, channel, kind, status) values (p_user, 'push', p_kind, 'skipped_preference');
      return;
    end if;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
    if v_secret is null then return; end if;

    perform net.http_post(
      url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('user_id', p_user, 'kind', p_kind, 'title', p_title, 'body', p_body, 'url', p_url)
    );
  exception when others then
    -- Never block the business write. A failed push is only a missed notification.
    return;
  end;
end;
$$;

-- Email to one user. Posts to send-email with the event kind and data. send-email renders and sends.
create or replace function public.notify_user_email(
  p_user uuid, p_kind text, p_data jsonb, p_always boolean default false, p_job_event boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_on boolean;
  v_verified timestamptz;
begin
  if p_user is null then return; end if;
  begin
    if p_job_event then
      select p.job_email into v_on from public.notification_preferences p where p.user_id = p_user;
      v_on := coalesce(v_on, true);
      if not v_on then
        insert into public.notification_log (user_id, channel, kind, status) values (p_user, 'email', p_kind, 'skipped_preference');
        return;
      end if;
    end if;

    -- Hard rule: never send to an unverified address.
    select pr.email_verified_at into v_verified from public.profiles pr where pr.id = p_user;
    if v_verified is null then
      insert into public.notification_log (user_id, channel, kind, status) values (p_user, 'email', p_kind, 'skipped_unverified');
      return;
    end if;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
    if v_secret is null then return; end if;

    perform net.http_post(
      url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('user_id', p_user, 'kind', p_kind, 'data', coalesce(p_data, '{}'::jsonb))
    );
  exception when others then
    return;
  end;
end;
$$;

revoke execute on function public.notify_user_push(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify_user_email(uuid, text, jsonb, boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Transition triggers
-- ---------------------------------------------------------------------------

-- Client: a pro submitted a priced quote. Revisions are not in this event.
create or replace function public.notify_on_quote_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid; v_trade text; v_zone text;
begin
  if new.revision_of is not null then return new; end if;
  select j.homeowner_id, j.trade, j.zone into v_ho, v_trade, v_zone from public.jobs j where j.id = new.job_id;
  perform public.notify_user_push(v_ho, 'job_quote_received', 'Recibiste una cotización',
    'Revisa el precio y el alcance antes de decidir.', '/trabajos/' || new.job_id, false);
  perform public.notify_user_email(v_ho, 'job_quote_received',
    jsonb_build_object('job_id', new.job_id, 'trade', v_trade, 'zone', v_zone, 'amount_dop', new.amount_dop), false, true);
  return new;
end; $$;

-- Two triggers: WHEN cannot reference TG_OP, and OLD is null on insert.
drop trigger if exists notify_quote_sent on public.quotes;
drop trigger if exists notify_quote_sent_insert on public.quotes;
create trigger notify_quote_sent_insert after insert on public.quotes
  for each row when (new.status = 'sent' and new.revision_of is null)
  execute function public.notify_on_quote_sent();
drop trigger if exists notify_quote_sent_update on public.quotes;
create trigger notify_quote_sent_update after update of status on public.quotes
  for each row when (new.status = 'sent' and new.revision_of is null and old.status is distinct from 'sent')
  execute function public.notify_on_quote_sent();

-- Pro: a client sent a request to this pro.
create or replace function public.notify_on_quote_invited() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_user_push(new.pro_id, 'request_invite', 'Nueva solicitud',
    'Un cliente pidió una cotización. Revisa el horario y las fotos.', '/pro/solicitudes', false);
  return new;
end; $$;

drop trigger if exists notify_quote_invited on public.quotes;
create trigger notify_quote_invited after insert on public.quotes
  for each row when (new.status = 'invited')
  execute function public.notify_on_quote_invited();

-- Pro: the client accepted this pro's quote.
create or replace function public.notify_on_quote_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_user_push(new.pro_id, 'quote_accepted', 'Tu cotización fue aceptada',
    'El cliente aceptó tu cotización. Revisa el trabajo.', '/trabajos/' || new.job_id, false);
  return new;
end; $$;

drop trigger if exists notify_quote_accepted on public.quotes;
create trigger notify_quote_accepted after update of status on public.quotes
  for each row when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function public.notify_on_quote_accepted();

-- Client: job booked, started, or completed. Each is a status transition on jobs.
create or replace function public.notify_on_job_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text; v_body text; v_kind text;
begin
  if new.status = 'accepted' then
    v_kind := 'job_accepted'; v_title := 'Trabajo agendado';
    v_body := 'El trabajo quedó agendado. Revisa los detalles.';
  elsif new.status = 'in_progress' then
    v_kind := 'job_started'; v_title := 'El trabajo comenzó';
    v_body := 'El profesional inició el trabajo.';
  else
    v_kind := 'job_completed'; v_title := 'Trabajo terminado';
    v_body := 'Revísalo y apruébalo para liberar el pago.';
  end if;
  perform public.notify_user_push(new.homeowner_id, v_kind, v_title, v_body, '/trabajos/' || new.id, false);
  perform public.notify_user_email(new.homeowner_id, v_kind,
    jsonb_build_object('job_id', new.id, 'trade', new.trade, 'zone', new.zone), false, true);
  return new;
end; $$;

drop trigger if exists notify_job_status on public.jobs;
create trigger notify_job_status after update of status on public.jobs
  for each row when (old.status is distinct from new.status
                     and new.status in ('accepted', 'in_progress', 'awaiting_approval'))
  execute function public.notify_on_job_status();

-- Client and pro: the payment was released (held -> released).
create or replace function public.notify_on_payment_released() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid; v_pro uuid; v_trade text; v_zone text;
begin
  select j.homeowner_id, j.pro_id, j.trade, j.zone into v_ho, v_pro, v_trade, v_zone
    from public.jobs j where j.id = new.job_id;
  perform public.notify_user_push(v_ho, 'job_paid', 'Pago liberado',
    'El pago de tu trabajo fue liberado.', '/trabajos/' || new.job_id, false);
  perform public.notify_user_email(v_ho, 'job_paid',
    jsonb_build_object('job_id', new.job_id, 'trade', v_trade, 'zone', v_zone), false, true);
  perform public.notify_user_push(v_pro, 'payout_released', 'Pago liberado para ti',
    'Tu pago de este trabajo fue liberado.', '/trabajos/' || new.job_id, false);
  return new;
end; $$;

drop trigger if exists notify_payment_released on public.payments;
create trigger notify_payment_released after update of status on public.payments
  for each row when (new.status = 'released' and old.status is distinct from 'released'
                     and new.purpose in ('job', 'revision', 'diagnostic'))
  execute function public.notify_on_payment_released();

-- Client: receipt when a payment succeeds. Inserted as 'held' by apply_stripe_checkout. Always sends.
-- Insert only: refunds move a payment back to 'held' by update, and those are not new receipts.
create or replace function public.notify_on_payment_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid;
begin
  select j.homeowner_id into v_ho from public.jobs j where j.id = new.job_id;
  perform public.notify_user_email(v_ho, 'receipt',
    jsonb_build_object('payment_id', new.id, 'job_id', new.job_id, 'amount_dop', new.amount_dop,
                       'purpose', new.purpose, 'paid_at', new.created_at,
                       'payment_intent_id', new.stripe_payment_intent_id),
    true, false);
  return new;
end; $$;

drop trigger if exists notify_payment_receipt on public.payments;
create trigger notify_payment_receipt after insert on public.payments
  for each row when (new.status = 'held')
  execute function public.notify_on_payment_receipt();

-- Dispute opened: the other party, plus a confirmation to the opener. Always sends.
create or replace function public.notify_on_dispute_opened() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid; v_pro uuid; v_other uuid;
begin
  select j.homeowner_id, j.pro_id into v_ho, v_pro from public.jobs j where j.id = new.job_id;
  v_other := case when new.opened_side = 'homeowner' then v_pro else v_ho end;
  perform public.notify_user_email(new.opened_by, 'dispute_opened_opener',
    jsonb_build_object('dispute_id', new.id, 'job_id', new.job_id), true, false);
  if v_other is not null then
    perform public.notify_user_email(v_other, 'dispute_opened_other',
      jsonb_build_object('dispute_id', new.id, 'job_id', new.job_id), true, false);
  end if;
  return new;
end; $$;

drop trigger if exists notify_dispute_opened on public.disputes;
create trigger notify_dispute_opened after insert on public.disputes
  for each row execute function public.notify_on_dispute_opened();

-- Dispute decided: both parties get the outcome. Always sends. Fires once, when decided_at is first set.
create or replace function public.notify_on_dispute_decided() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid; v_pro uuid;
begin
  select j.homeowner_id, j.pro_id into v_ho, v_pro from public.jobs j where j.id = new.job_id;
  perform public.notify_user_email(v_ho, 'dispute_decided',
    jsonb_build_object('dispute_id', new.id, 'job_id', new.job_id, 'outcome', new.status, 'reason', new.decision_reason), true, false);
  if v_pro is not null then
    perform public.notify_user_email(v_pro, 'dispute_decided',
      jsonb_build_object('dispute_id', new.id, 'job_id', new.job_id, 'outcome', new.status, 'reason', new.decision_reason), true, false);
  end if;
  return new;
end; $$;

drop trigger if exists notify_dispute_decided on public.disputes;
create trigger notify_dispute_decided after update of decided_at on public.disputes
  for each row when (old.decided_at is null and new.decided_at is not null)
  execute function public.notify_on_dispute_decided();

-- Welcome: the first time an email is verified. Sends only to a verified address.
create or replace function public.notify_on_email_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_user_email(new.id, 'welcome', jsonb_build_object('name', new.full_name), true, false);
  return new;
end; $$;

drop trigger if exists notify_email_verified on public.profiles;
create trigger notify_email_verified after update of email_verified_at on public.profiles
  for each row when (old.email_verified_at is null and new.email_verified_at is not null)
  execute function public.notify_on_email_verified();

-- Trigger functions are never called directly.
revoke all on function public.notify_on_quote_sent() from public, anon, authenticated;
revoke all on function public.notify_on_quote_invited() from public, anon, authenticated;
revoke all on function public.notify_on_quote_accepted() from public, anon, authenticated;
revoke all on function public.notify_on_job_status() from public, anon, authenticated;
revoke all on function public.notify_on_payment_released() from public, anon, authenticated;
revoke all on function public.notify_on_payment_receipt() from public, anon, authenticated;
revoke all on function public.notify_on_dispute_opened() from public, anon, authenticated;
revoke all on function public.notify_on_dispute_decided() from public, anon, authenticated;
revoke all on function public.notify_on_email_verified() from public, anon, authenticated;
