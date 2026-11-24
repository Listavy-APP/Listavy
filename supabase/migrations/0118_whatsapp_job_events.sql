-- 0118 · WhatsApp job-event notifications (build queue item 5b).
-- STATUS: NOT APPLIED. Sam reviews on the branch and applies it himself on Fabian's go.
--
-- Mirrors 0091 (push + email) as a third channel:
--   1. notification_preferences.job_whatsapp (default ON; a missing row means ON).
--   2. notification_log accepts channel 'whatsapp' and status 'skipped_no_phone'.
--   3. platform_settings row 'whatsapp_templates': the sender, the kind -> ContentSid map (with the es_MX
--      language tag and the ordered variable names), and ui_enabled. Template SIDs are configuration:
--      a re-approved template is a settings change, never a redeploy. Template wording stays in Twilio/Meta.
--   4. notify_user_whatsapp(): the only WhatsApp sender. Preference check, phone guard, then a vault-signed
--      POST to send-whatsapp. Every branch is exception-wrapped: a send never blocks the business write.
--   5. Call sites: one WhatsApp call beside each existing email call, in the same functions.
--      pro_mark_arrived gains the one notification it never had (template 3, pro_llego).
--
-- Readings (Sam, 5b brief): record messages (receipt, dispute decided) ignore the toggle.
-- Everything else follows job_whatsapp. No phone means no send, logged as skipped_no_phone.
-- The UI toggle stays hidden until ui_enabled is true (set after the live proof, not in this migration).
-- Migration numbers: 0114 to 0117 were taken by earlier items. This is 0118.

-- 1. Preference
alter table public.notification_preferences
  add column if not exists job_whatsapp boolean not null default true;

-- 2. Log: new channel and new skip status
alter table public.notification_log drop constraint if exists notification_log_channel_check;
alter table public.notification_log add constraint notification_log_channel_check
  check (channel in ('push', 'email', 'whatsapp'));
alter table public.notification_log drop constraint if exists notification_log_status_check;
alter table public.notification_log add constraint notification_log_status_check
  check (status in ('sent', 'failed', 'no_subscription', 'skipped_preference', 'skipped_unverified', 'skipped_no_phone'));

-- 3. Settings. Read by the service role (send-whatsapp). Clients reach only the boolean below.
insert into public.platform_settings (key, value) values ('whatsapp_templates', '{
  "ui_enabled": false,
  "messaging_service_sid": "MG3207aabe65c67f1b480f6ba7c8b6b55c",
  "kinds": {
    "job_quote_received":   {"sid": "HX61fd01bafcaeaee12d10b29477818a25", "language": "es_MX", "vars": ["first_name", "trade", "amount"]},
    "job_accepted":         {"sid": "HXeb5f0c4550613e98ec9cb415d66f5b5a", "language": "es_MX", "vars": ["first_name", "trade", "zone"]},
    "job_arrived":          {"sid": "HXdbc26e939fc8f469fefc800c4ca2b8dc", "language": "es_MX", "vars": ["first_name", "trade"]},
    "job_started":          {"sid": "HXf6e3949e2f2e255887125a36e24729ac", "language": "es_MX", "vars": ["first_name", "trade"]},
    "job_completed":        {"sid": "HX6d5d8e1aaa526808f61077cc2f81c933", "language": "es_MX", "vars": ["first_name", "trade"]},
    "receipt":              {"sid": "HXc98811ec4a3412c54beac039a1438cbf", "language": "es_MX", "vars": ["first_name", "amount", "trade"]},
    "job_cancelled_refund": {"sid": "HXdf87df4c9f7bbbb4c8881135b98d352f", "language": "es_MX", "vars": ["first_name", "trade", "refund"]},
    "dispute_decided":      {"sid": "HXb51020aea17ec657e4ea9beb2bc360a5", "language": "es_MX", "vars": ["first_name", "outcome"]},
    "request_invite":       {"sid": "HX7d2c737fe4c49a72f29414ea0948b8fa", "language": "es_MX", "vars": ["first_name", "trade", "zone"]},
    "quote_accepted":       {"sid": "HXf61587352398faad29276111d9c95959", "language": "es_MX", "vars": ["first_name", "trade"]},
    "payout_released":      {"sid": "HX24552f24b4204eadc08854ed50f5fe99", "language": "es_MX", "vars": ["first_name", "trade"]}
  }
}'::jsonb)
on conflict (key) do nothing;

-- Client-readable flag for the ajustes toggle. Nothing else in platform_settings is exposed.
create or replace function public.job_whatsapp_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value->>'ui_enabled')::boolean from public.platform_settings where key = 'whatsapp_templates'), false);
$$;

revoke all on function public.job_whatsapp_available() from public, anon;
grant execute on function public.job_whatsapp_available() to authenticated;

-- 4. Sender. Same shape as notify_user_email (0098). Posts to send-whatsapp with the kind and data.
create or replace function public.notify_user_whatsapp(
  p_user uuid, p_kind text, p_data jsonb, p_always boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_on boolean;
  v_phone text;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_link text := public.notification_link(p_kind, v_data);
begin
  if p_user is null then return; end if;
  begin
    select p.job_whatsapp into v_on from public.notification_preferences p where p.user_id = p_user;
    v_on := coalesce(v_on, true);
    if not p_always and not v_on then
      insert into public.notification_log (user_id, channel, kind, status, link) values (p_user, 'whatsapp', p_kind, 'skipped_preference', v_link);
      return;
    end if;

    select pr.phone into v_phone from public.profiles pr where pr.id = p_user;
    if v_phone is null then
      insert into public.notification_log (user_id, channel, kind, status, link) values (p_user, 'whatsapp', p_kind, 'skipped_no_phone', v_link);
      return;
    end if;

    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
    if v_secret is null then return; end if;

    perform net.http_post(
      url := 'https://qmugoumizvtvuzndhosq.supabase.co/functions/v1/send-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('user_id', p_user, 'kind', p_kind, 'data', v_data)
    );
  exception when others then
    -- Never block the business write. A failed WhatsApp send is only a missed message.
    return;
  end;
end;
$$;

revoke execute on function public.notify_user_whatsapp(uuid, text, jsonb, boolean) from public, anon, authenticated;

-- 5. Call sites. Each function below is the latest definition from its source migration, with one
--    notify_user_whatsapp call added beside its email call. Nothing else changed.
create or replace function public.notify_on_quote_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid; v_trade text; v_zone text;
begin
  if new.revision_of is not null then return new; end if;
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.fixed_service_id is not null) then return new; end if;
  select j.homeowner_id, j.trade, j.zone into v_ho, v_trade, v_zone from public.jobs j where j.id = new.job_id;
  perform public.notify_user_push(v_ho, 'job_quote_received', 'Recibiste una cotización',
    'Revisa el precio y el alcance antes de decidir.', '/trabajos/' || new.job_id, false);
  perform public.notify_user_email(v_ho, 'job_quote_received',
    jsonb_build_object('job_id', new.job_id, 'trade', v_trade, 'zone', v_zone, 'amount_dop', new.amount_dop), false, true);
  perform public.notify_user_whatsapp(v_ho, 'job_quote_received', jsonb_build_object('job_id', new.job_id), false);
  return new;
end; $$;


create or replace function public.notify_on_quote_invited() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.fixed_service_id is not null) then return new; end if;
  perform public.notify_user_push(new.pro_id, 'request_invite', 'Nueva solicitud',
    'Un cliente pidió una cotización. Revisa el horario y las fotos.', '/pro/solicitudes', false);
  perform public.notify_user_whatsapp(new.pro_id, 'request_invite', jsonb_build_object('job_id', new.job_id), false);
  return new;
end; $$;


create or replace function public.notify_on_quote_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_user_push(new.pro_id, 'quote_accepted', 'Tu cotización fue aceptada',
    'El cliente aceptó tu cotización. Revisa el trabajo.', '/trabajos/' || new.job_id, false);
  perform public.notify_user_whatsapp(new.pro_id, 'quote_accepted', jsonb_build_object('job_id', new.job_id), false);
  return new;
end; $$;


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
  perform public.notify_user_whatsapp(new.homeowner_id, v_kind, jsonb_build_object('job_id', new.id), false);
  return new;
end; $$;


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
  perform public.notify_user_whatsapp(v_pro, 'payout_released', jsonb_build_object('job_id', new.job_id), false);
  return new;
end; $$;


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
  perform public.notify_user_whatsapp(v_ho, 'receipt', jsonb_build_object('job_id', new.job_id, 'amount_dop', new.amount_dop), true);
  return new;
end; $$;


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
  perform public.notify_user_whatsapp(v_ho, 'dispute_decided', jsonb_build_object('job_id', new.job_id, 'outcome', new.status), true);
  if v_pro is not null then
    perform public.notify_user_whatsapp(v_pro, 'dispute_decided', jsonb_build_object('job_id', new.job_id, 'outcome', new.status), true);
  end if;
  return new;
end; $$;


create or replace function public.cancel_job_with_refund(p_job uuid, p_by text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  j record;
  uid uuid := (select auth.uid());
  v_reason text;
  v_fee_applies boolean := false;
  v_refunds integer := 0;
  v_settle jsonb;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;

  if p_by = 'homeowner' then
    if j.homeowner_id is distinct from uid then raise exception 'Solo el cliente puede cancelar.'; end if;
    v_reason := 'client_cancel_pre_work';
  elsif p_by = 'pro' then
    if j.pro_id is distinct from uid then raise exception 'Solo el profesional puede cancelar.'; end if;
    v_reason := 'pro_cancel';
  else
    raise exception 'Parte no válida.';
  end if;

  -- A repeat call on a cancelled job does nothing. No second refund, no second fee.
  if j.status = 'cancelled' then return 'cancelled'; end if;

  if j.status not in ('requested', 'quoted', 'accepted') then
    raise exception 'El trabajo no se puede cancelar en este estado.';
  end if;

  if p_by = 'pro' then
    insert into public.pro_strikes (pro_id, job_id, reason) values (j.pro_id, j.id, 'pro_cancel');
  end if;

  -- Fee: client cancels an accepted job, and the earliest held job payment is older than 2 hours.
  if p_by = 'homeowner' and j.status = 'accepted' then
    v_fee_applies := exists (
      select 1 from (
        select created_at from public.payments
         where job_id = j.id and purpose = 'job' and status = 'held'
         order by created_at, id limit 1
      ) first_paid
      where first_paid.created_at <= now() - interval '2 hours'
    );
  end if;

  update public.jobs set status = 'cancelled' where id = j.id;
  update public.quotes set status = 'withdrawn' where job_id = j.id and status in ('invited', 'sent');

  v_settle := public._settle_cancellation(j.id, v_reason, v_fee_applies);
  perform public.notify_user_email(j.homeowner_id, 'job_cancelled_refund',
    jsonb_build_object('job_id', j.id, 'trade', j.trade, 'zone', j.zone,
      'fee_dop', (v_settle->>'fee_dop')::int, 'refund_dop', (v_settle->>'refund_dop')::int), false, true);
  perform public.notify_user_whatsapp(j.homeowner_id, 'job_cancelled_refund', jsonb_build_object('job_id', j.id, 'fee_dop', (v_settle->>'fee_dop')::int, 'refund_dop', (v_settle->>'refund_dop')::int), false);

  select count(*) into v_refunds from public.refunds where job_id = j.id and status = 'pending';
  if v_refunds = 0 then return 'cancelled'; end if;
  return 'refund_pending';
end;
$function$;


create or replace function public.pro_report_client_no_show(p_job uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j record;
  uid uuid := (select auth.uid());
  v_fee_applies boolean := false;
  v_settle jsonb;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.' using errcode = 'P0002'; end if;
  if uid is null or j.pro_id is distinct from uid then
    raise exception 'Solo el profesional puede reportar al cliente.' using errcode = '42501';
  end if;
  if j.status = 'cancelled' then return 'cancelled'; end if;
  if j.status <> 'accepted' or j.started_at is not null then
    raise exception 'Solo puedes reportar al cliente en un trabajo aceptado que no ha empezado.' using errcode = '22023';
  end if;
  if j.arrived_at is null then
    raise exception 'Primero marca tu llegada.' using errcode = '22023';
  end if;

  v_fee_applies := exists (
    select 1 from (
      select created_at from public.payments
       where job_id = j.id and purpose = 'job' and status = 'held'
       order by created_at, id limit 1
    ) first_paid
    where first_paid.created_at <= now() - interval '2 hours'
  );

  update public.jobs set status = 'cancelled' where id = j.id;
  update public.quotes set status = 'withdrawn' where job_id = j.id and status in ('invited', 'sent');
  v_settle := public._settle_cancellation(j.id, 'client_no_show', v_fee_applies);
  perform public.notify_user_email(j.homeowner_id, 'job_cancelled_refund',
    jsonb_build_object('job_id', j.id, 'trade', j.trade, 'zone', j.zone,
      'fee_dop', (v_settle->>'fee_dop')::int, 'refund_dop', (v_settle->>'refund_dop')::int), false, true);
  perform public.notify_user_whatsapp(j.homeowner_id, 'job_cancelled_refund', jsonb_build_object('job_id', j.id, 'fee_dop', (v_settle->>'fee_dop')::int, 'refund_dop', (v_settle->>'refund_dop')::int), false);

  if exists (select 1 from public.refunds where job_id = j.id and status = 'pending') then
    return 'refund_pending';
  end if;
  return 'cancelled';
end;
$$;


create or replace function public.pro_mark_arrived(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j record;
  uid uuid := (select auth.uid());
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.' using errcode = 'P0002'; end if;
  if uid is null or j.pro_id is distinct from uid then
    raise exception 'Solo el profesional puede marcar su llegada.' using errcode = '42501';
  end if;
  if j.status <> 'accepted' or j.started_at is not null then
    raise exception 'Solo puedes marcar tu llegada en un trabajo aceptado que no ha empezado.' using errcode = '22023';
  end if;
  if j.arrived_at is null then
    update public.jobs set arrived_at = now() where id = j.id;
    perform public.notify_user_whatsapp(j.homeowner_id, 'job_arrived', jsonb_build_object('job_id', j.id), false);
  end if;
end;
$$;


-- Event-time function bodies keep their existing revokes (trigger functions and RPCs), set in their source migrations.
