-- 0117 Urgent lane (Item 19).
--
-- Readings (spec, 2026-11-22):
--   1. The urgent fee is RD$500 flat, 100% to the pro. platform_settings key urgent_fee_dop, default 500.
--      The job row snapshots the fee at creation.
--   2. The fee carries no commission. It is outside the amount the commission rules read.
--   3. A pre-start cancel refunds the fee in full, like the tip. Cancel fees come from the charged part only.
--   4. Urgent means today: ASAP, or the Santo Domingo date of today. Never a future date.
--   5. No response-time promise in copy (app side).
--   6. Urgent never changes who the client chose (app side).
--
-- Payment split identity, with the urgent fee present (payments_split_consistent, redefined here):
--   pro_payout_dop + commission_dop + urgent_fee_pro_dop = amount_dop + referral_discount_dop + discount_dop
-- where
--   amount_dop          = charged_dop + urgent_fee_dop + tip_dop        (what the client pays)
--   charged_dop         = quote - diagnostic credit - referral - promo  (the commissionable base)
--   pro_payout_dop      = charged_dop - commission_dop + tip_dop        (unchanged from 0095; tip stays here)
--   urgent_fee_pro_dop  = urgent_fee_dop                                (the whole fee, paid to the pro)
-- Check: (charged - c + tip) + c + fee = charged + fee + tip = amount. The fee sits on the amount, not
-- on the commission. Without an urgent fee (fee = 0) the identity is the 0095 identity.
-- A correction to the spec's literal form ("= amount_dop - tip_dop"): pro_payout_dop already includes the
-- tip, so the tip stays on the right-hand side through amount_dop. Flagged to Fabian before this build.
--
-- Order in apply_stripe_checkout: discounts first, then the urgent fee, then the tip, the same place the
-- tip sits. The tip cap stays at 20% of the quote. The fee is never discounted and never commissioned.
--
-- Cancellation: the client's cancel fee (max RD$300) comes from amount - tip - urgent fee. The urgent fee
-- therefore never becomes a cancel fee. A pre-start cancel refunds it in full.

-- 1. Platform setting. Same pattern as first_job_free_enabled (0108).
insert into public.platform_settings (key, value) values ('urgent_fee_dop', '{"dop": 500}')
  on conflict (key) do nothing;

create or replace function public.urgent_fee_setting()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (value->>'dop')::integer from public.platform_settings where key = 'urgent_fee_dop'),
    500
  );
$$;
revoke all on function public.urgent_fee_setting() from public, anon, authenticated;

-- 2. Columns.
alter table public.jobs add column if not exists urgent boolean not null default false;
alter table public.jobs add column if not exists urgent_fee_dop integer;
alter table public.jobs drop constraint if exists jobs_urgent_fee_consistent;
alter table public.jobs add constraint jobs_urgent_fee_consistent
  check ((urgent and urgent_fee_dop > 0) or (not urgent and urgent_fee_dop is null));

alter table public.pros add column if not exists urgent_available boolean not null default false;

alter table public.payments add column if not exists urgent_fee_dop integer not null default 0
  check (urgent_fee_dop >= 0);
alter table public.payments add column if not exists urgent_fee_pro_dop integer not null default 0
  check (urgent_fee_pro_dop >= 0);
alter table public.payments drop constraint if exists payments_urgent_fee_pro_matches;
alter table public.payments add constraint payments_urgent_fee_pro_matches
  check (urgent_fee_pro_dop = urgent_fee_dop);

-- 3. Split identity with the urgent fee (see header). Replaces the 0095 constraint.
alter table public.payments drop constraint if exists payments_split_consistent;
alter table public.payments add constraint payments_split_consistent
  check (amount_dop is null or pro_payout_dop is null or commission_dop is null
         or pro_payout_dop + commission_dop + urgent_fee_pro_dop = amount_dop + referral_discount_dop + discount_dop);

-- 4. Guards. The urgent snapshot is written only by create_job_request. The opt-in is written only by
-- pro_set_urgent_available, which sets the same pro_internal flag that the pricing RPC uses.
create or replace function public.jobs_guard_urgent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.urgent is distinct from old.urgent or new.urgent_fee_dop is distinct from old.urgent_fee_dop then
    raise exception 'El modo urgente lo fija Listavy al crear el trabajo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.jobs_guard_urgent() from public, anon, authenticated;

drop trigger if exists jobs_guard_urgent on public.jobs;
create trigger jobs_guard_urgent
  before update of urgent, urgent_fee_dop on public.jobs
  for each row execute function public.jobs_guard_urgent();

create or replace function public.pros_guard_urgent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.urgent_available is distinct from old.urgent_available
     and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
    raise exception 'Cambia tu disponibilidad para urgentes desde tu horario.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.pros_guard_urgent() from public, anon, authenticated;

drop trigger if exists pros_guard_urgent on public.pros;
create trigger pros_guard_urgent
  before update of urgent_available on public.pros
  for each row execute function public.pros_guard_urgent();

-- 5. The pro flips their own opt-in. Owner only. The flag is set for this transaction only.
create or replace function public.pro_set_urgent_available(p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Inicia sesión para cambiar tu disponibilidad.' using errcode = '42501';
  end if;
  if p_available is null then
    raise exception 'Valor no válido.' using errcode = '22023';
  end if;
  perform set_config('listavy.pro_internal', 'on', true);
  update public.pros set urgent_available = p_available where id = v_uid;
  if not found then
    raise exception 'Solo un profesional puede cambiar esta opción.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.pro_set_urgent_available(boolean) from public, anon;
grant execute on function public.pro_set_urgent_available(boolean) to authenticated;

-- 6. Admin fee. Super admin only, reason required, logged. Same rules as admin_set_first_job_free.
create or replace function public.admin_get_urgent_fee()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return public.urgent_fee_setting();
end;
$$;

create or replace function public.admin_set_urgent_fee(p_dop integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() or not public.is_super_admin() then
    raise exception 'Solo un super administrador puede cambiar la tarifa.' using errcode = '42501';
  end if;
  -- Bounds are a build decision (not in the spec): RD$100 to RD$5,000 guards against a typo.
  if p_dop is null or p_dop < 100 or p_dop > 5000 then
    raise exception 'La tarifa debe estar entre RD$100 y RD$5,000.' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  update public.platform_settings
     set value = jsonb_build_object('dop', p_dop), updated_at = now(), updated_by = (select auth.uid())
   where key = 'urgent_fee_dop';
  perform public.admin_log('urgent_fee_changed', null,
    jsonb_build_object('dop', p_dop, 'reason', trim(p_reason)));
end;
$$;
revoke all on function public.admin_get_urgent_fee() from public, anon;
grant execute on function public.admin_get_urgent_fee() to authenticated;
revoke all on function public.admin_set_urgent_fee(integer, text) from public, anon;
grant execute on function public.admin_set_urgent_fee(integer, text) to authenticated;

-- 7. create_job_request gains p_urgent at the end (default false). The 12-argument version is replaced,
-- so existing named-argument calls keep working. Body copied from 0111, with the urgent rules added.
drop function if exists public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid);
create or replace function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text,
                                          p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text,
                                          p_requested_pro_type text default 'any',
                                          p_scheduled_date date default null,
                                          p_scheduled_window text default null,
                                          p_municipality_id uuid default null,
                                          p_urgent boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_pro uuid;
  v_open integer;
  v_unbooked integer;
  v_last_booking timestamptz;
  v_block_from timestamptz;
  v_price_ok boolean;
  v_available boolean;
  v_mun uuid;
  v_is_demo boolean;
  v_pro_type text;
  v_urgent boolean := coalesce(p_urgent, false);
  v_fee integer;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_job_type not in ('repair', 'diagnostic') then raise exception 'Tipo de trabajo no válido.'; end if;
  if p_requested_pro_type is null then
    raise exception 'Elige si buscas persona, empresa o cualquiera.';
  end if;
  if p_requested_pro_type not in ('individual', 'company', 'any') then
    raise exception 'Tipo de profesional no válido.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 20 then
    raise exception 'Describe el problema con al menos 20 caracteres.';
  end if;
  if p_photo_paths is null or cardinality(p_photo_paths) < 1 then
    raise exception 'Agrega al menos una foto del problema.';
  end if;
  if p_pro_ids is null or cardinality(p_pro_ids) < 1 or cardinality(p_pro_ids) > 3 then
    raise exception 'Elige entre 1 y 3 profesionales.';
  end if;
  if (select count(distinct x) from unnest(p_pro_ids) x) <> cardinality(p_pro_ids) then
    raise exception 'Hay profesionales repetidos.';
  end if;

  -- Schedule (0090). NULL, NULL means "Lo antes posible". Otherwise one date and one window.
  if (p_scheduled_date is null) <> (p_scheduled_window is null) then
    raise exception 'Elige fecha y horario, o Lo antes posible.';
  end if;
  if p_scheduled_date is not null then
    if p_scheduled_window not in ('morning', 'afternoon', 'evening') then
      raise exception 'Horario no válido.';
    end if;
    if p_scheduled_date < public.santo_domingo_today() then
      raise exception 'La fecha debe ser hoy o posterior.';
    end if;
    if p_scheduled_date > public.santo_domingo_today() + 60 then
      raise exception 'Puedes agendar hasta 60 días después de hoy.';
    end if;
  end if;

  -- Urgent (0117). Today only: ASAP, or today's date. A future date is refused.
  if v_urgent then
    if p_scheduled_date is not null and p_scheduled_date <> public.santo_domingo_today() then
      raise exception 'Lo urgente es para hoy. Cambia la fecha a hoy o quita la urgencia.' using errcode = '22023';
    end if;
    v_fee := public.urgent_fee_setting();
    if v_fee is null or v_fee <= 0 then
      raise exception 'La tarifa urgente no está configurada.' using errcode = '22023';
    end if;
  end if;

  select max(booked_at) into v_last_booking from public.jobs where homeowner_id = v_uid;
  select count(*) into v_unbooked from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted')
     and created_at > now() - interval '30 days'
     and (v_last_booking is null or created_at > v_last_booking);
  if v_unbooked >= 5 then
    select created_at into v_block_from from public.jobs
     where homeowner_id = v_uid and status in ('requested', 'quoted')
       and created_at > now() - interval '30 days'
       and (v_last_booking is null or created_at > v_last_booking)
     order by created_at desc offset 4 limit 1;
    if now() < v_block_from + interval '14 days' then
      raise exception 'Tienes demasiadas solicitudes sin contratar. Puedes pedir cotizaciones de nuevo en 14 días.';
    end if;
  end if;

  select count(*) into v_open from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
  if v_open >= 3 then
    raise exception 'Ya tienes 3 solicitudes abiertas. Cancela una antes de pedir otra.';
  end if;

  foreach v_pro in array p_pro_ids loop
    -- Self-hire guard: a pro cannot request their own services, even when calling this directly.
    if v_pro = v_uid then
      raise exception 'No puedes contratarte a ti mismo. Elige otro profesional.';
    end if;
    select p.available, p.is_demo, p.pro_type into v_available, v_is_demo, v_pro_type
      from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
    -- Demo gate (0058): a demonstration profile never receives a request, even when called directly.
    if v_is_demo then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Availability gate (UI phase §7, item 6). Availability is the master switch for urgent work too.
    if not v_available then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Type gate (person vs company, Phase 1). 'any' accepts both.
    if p_requested_pro_type <> 'any' and v_pro_type is distinct from p_requested_pro_type then
      raise exception 'Un profesional elegido no coincide con el tipo que pediste (persona o empresa). Elige otro.';
    end if;
  end loop;

  -- Place (0111): the job's municipality. Older clients without one fall back to the legacy market of the zone.
  v_mun := coalesce(p_municipality_id, (select m.id from public.municipalities m where m.legacy_city = public.city_of_zone(p_zone)));
  if v_mun is null then raise exception 'Elige el municipio donde necesitas el servicio.' using errcode = '22023'; end if;

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path, requested_pro_type,
                           scheduled_date, scheduled_window, municipality_id, urgent, urgent_fee_dop)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path, p_requested_pro_type,
          p_scheduled_date, p_scheduled_window, v_mun, v_urgent, case when v_urgent then v_fee else null end)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$function$;
revoke execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid, boolean) from public, anon;
grant execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid, boolean) to authenticated;

-- 8. apply_stripe_checkout (0108 body) with the urgent fee. The fee comes from the job snapshot, not from the
-- caller. The charged amount must equal charged + fee + tip. The fee is recorded on the payment and paid in full to the pro.
create or replace function public.apply_stripe_checkout(
  p_event_id text, p_event_type text, p_livemode boolean, p_job uuid, p_session_id text,
  p_payment_intent_id text, p_purpose text, p_amount_minor bigint, p_fx numeric,
  p_amount_dop integer, p_commission_dop integer, p_pro_payout_dop integer, p_tip_dop integer)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  j record;
  v_quote integer;
  v_credit integer;
  v_discount integer := 0;
  v_expected integer;
  v_tip_cap integer;
  v_redemption uuid;
  v_promo uuid;
  v_promo_dop integer := 0;
  v_payment uuid;
  v_urgent_fee integer := 0;
begin
  -- Idempotency. A repeated event id is a no-op, and a failure below rolls this row back too.
  insert into public.stripe_events (id, type, livemode)
    values (p_event_id, p_event_type, p_livemode)
    on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  if j.status <> 'accepted' or j.payment_status <> 'unpaid' then
    raise exception 'El trabajo no está listo para pago.';
  end if;
  if j.approved_quote_id is null then raise exception 'El trabajo no tiene cotización aprobada.'; end if;

  select amount_dop into v_quote from public.quotes where id = j.approved_quote_id;
  v_expected := v_quote;

  if j.credit_from_job_id is not null then
    select amount_dop into v_credit
      from public.payments
     where job_id = j.credit_from_job_id and purpose = 'diagnostic' and status in ('held', 'released')
     limit 1;
    if v_credit is null then raise exception 'El diagnóstico no tiene pago registrado.'; end if;
    v_expected := greatest(0, v_quote - v_credit);
  end if;

  v_discount := public.referral_discount_reserved(p_job);
  v_expected := greatest(0, v_expected - v_discount);

  -- Promo code reserved for this job (0095). At most one live reservation per job.
  select pr.id, pr.promo_id, pr.discount_dop into v_redemption, v_promo, v_promo_dop
    from public.promo_redemptions pr where pr.job_id = p_job and pr.status = 'reserved' limit 1;
  v_promo_dop := coalesce(v_promo_dop, 0);
  v_expected := greatest(0, v_expected - v_promo_dop);

  -- Urgent fee (0117): on top of the charged part, before the tip. Never discounted, never commissioned.
  if j.urgent then
    v_urgent_fee := coalesce(j.urgent_fee_dop, 0);
    if v_urgent_fee <= 0 then raise exception 'La tarifa urgente del trabajo no es válida.'; end if;
  end if;

  if p_tip_dop is null or p_tip_dop < 0 then raise exception 'La propina no es válida.'; end if;
  -- Half-up 20% of the quote: floor((quote * 20 * 2 + 100) / 200).
  v_tip_cap := (v_quote * 40 + 100) / 200;
  if p_tip_dop > v_tip_cap then raise exception 'La propina supera el 20 por ciento del trabajo.'; end if;

  if p_amount_dop <> v_expected + v_urgent_fee + p_tip_dop then
    raise exception 'El monto cobrado no coincide con la cotización menos el crédito y el descuento, más la urgencia y la propina.';
  end if;

  insert into public.payments (
    job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, commission_dop,
    status, amount_dop, pro_payout_dop, tip_dop, purpose,
    stripe_checkout_session_id, stripe_payment_intent_id, held_at, referral_discount_dop,
    discount_dop, promo_code_id, urgent_fee_dop, urgent_fee_pro_dop
  ) values (
    p_job, 'stripe', 'USD', p_amount_minor, p_fx, p_commission_dop,
    'held', p_amount_dop, p_pro_payout_dop, p_tip_dop, p_purpose,
    p_session_id, p_payment_intent_id, now(), v_discount,
    v_promo_dop, v_promo, v_urgent_fee, v_urgent_fee
  ) returning id into v_payment;

  -- First-job waiver (0108). The first paid job of a pro claims the pro's one slot. The primary key on
  -- pro_launch_waivers makes the claim race-safe: exactly one payment wins. The slot is used even while
  -- the switch is off, so turning it on later does not waive an earlier job.
  if p_purpose in ('job', 'diagnostic') and j.pro_id is not null then
    insert into public.pro_launch_waivers (pro_id, payment_id, reason)
      values (j.pro_id, v_payment, case when public.first_job_free_enabled() then 'waived' else 'off' end)
      on conflict (pro_id) do nothing;
    if found and public.first_job_free_enabled() then
      update public.payments
         set commission_dop = 0,
             pro_payout_dop = p_pro_payout_dop + p_commission_dop,
             commission_waived = true
       where id = v_payment;
    end if;
  end if;

  if v_redemption is not null then
    update public.promo_redemptions set status = 'redeemed', payment_id = v_payment, redeemed_at = now()
     where id = v_redemption;
  end if;

  if v_discount > 0 then perform public.referral_consume_reservation(p_job); end if;
  update public.jobs set payment_status = 'paid' where id = p_job;
  update public.stripe_events set processed_at = now() where id = p_event_id;
  return 'applied';
end;
$function$;

-- 9. Cancel fee base excludes the urgent fee. Body from 0107 (_settle_cancellation). The fee is never kept.
create or replace function public._settle_cancellation(p_job uuid, p_reason text, p_fee_applies boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary record;
  v_has_primary boolean := false;
  v_other record;
  v_fee integer := 0;
  v_fee_minor bigint := 0;
  v_refund integer := 0;
begin
  select * into v_primary from public.payments
   where job_id = p_job and purpose = 'job' and status = 'held'
   order by created_at, id
   limit 1
   for update;
  v_has_primary := found;

  -- amount_dop = charged + urgent fee + tip. The cancel fee comes from the charged part only (0117).
  -- The tip and the urgent fee are never kept: the refund is amount_dop - fee, so both return whole.
  v_fee := case when v_has_primary and p_fee_applies
                then greatest(0, least(300, coalesce(v_primary.amount_dop, 0)
                                          - coalesce(v_primary.tip_dop, 0)
                                          - coalesce(v_primary.urgent_fee_dop, 0)))
                else 0 end;

  if v_fee > 0 then
    v_fee_minor := round(v_primary.amount_minor::numeric * v_fee / v_primary.amount_dop)::bigint;
    update public.payments
       set keep_dop = v_fee,
           keep_minor = v_fee_minor,
           keep_pro_payout_dop = v_fee,
           keep_commission_dop = 0,
           cancel_fee_release_after = now() + interval '48 hours'
     where id = v_primary.id;
    if v_primary.amount_dop - v_fee > 0 then
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
      values (v_primary.id, p_job, v_primary.amount_dop - v_fee, v_primary.amount_minor - v_fee_minor, 'client_cancel_fee');
      v_refund := v_refund + (v_primary.amount_dop - v_fee);
    end if;
  elsif v_has_primary then
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
    values (v_primary.id, p_job, v_primary.amount_dop, v_primary.amount_minor, p_reason);
    v_refund := v_refund + v_primary.amount_dop;
  end if;

  -- Every other held job or diagnostic payment refunds in full.
  for v_other in
    select * from public.payments
     where job_id = p_job and purpose in ('job', 'diagnostic') and status = 'held'
       and (not v_has_primary or id <> v_primary.id)
  loop
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
    values (v_other.id, p_job, v_other.amount_dop, v_other.amount_minor, p_reason);
    v_refund := v_refund + v_other.amount_dop;
  end loop;

  return jsonb_build_object('fee_dop', v_fee, 'refund_dop', v_refund);
end;
$$;

-- 10. Preview: the same fee base, and the urgent fee shown as its own line.
create or replace function public.cancellation_preview(p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j record;
  uid uuid := (select auth.uid());
  v_paid integer;
  v_urgent integer;
  v_first record;
  v_fee integer := 0;
  v_fee_applies boolean := false;
  v_side text;
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'Trabajo no encontrado.' using errcode = 'P0002'; end if;
  if uid is null or (j.homeowner_id is distinct from uid and j.pro_id is distinct from uid) then
    raise exception 'Solo las partes del trabajo pueden ver la cancelación.' using errcode = '42501';
  end if;
  v_side := case when j.homeowner_id = uid then 'homeowner' else 'pro' end;

  if j.status not in ('requested', 'quoted', 'accepted') then
    return jsonb_build_object('cancelable', false);
  end if;

  select coalesce(sum(amount_dop), 0)::int, coalesce(sum(urgent_fee_dop), 0)::int
    into v_paid, v_urgent
    from public.payments
   where job_id = j.id and purpose in ('job', 'diagnostic') and status = 'held';

  select * into v_first from public.payments
   where job_id = j.id and purpose = 'job' and status = 'held'
   order by created_at, id limit 1;

  if v_side = 'homeowner' and j.status = 'accepted' and found then
    v_fee_applies := v_first.created_at <= now() - interval '2 hours';
    if v_fee_applies then
      v_fee := greatest(0, least(300, coalesce(v_first.amount_dop, 0)
                                      - coalesce(v_first.tip_dop, 0)
                                      - coalesce(v_first.urgent_fee_dop, 0)));
    end if;
  end if;

  return jsonb_build_object(
    'cancelable', true,
    'side', v_side,
    'paid_dop', v_paid,
    'urgent_fee_dop', v_urgent,
    'fee_dop', v_fee,
    'fee_applies', v_fee_applies,
    'refund_dop', v_paid - v_fee
  );
end;
$$;

-- 11. Payout. The pro is paid the pro share plus the whole urgent fee. A kept cancel fee already holds its own
-- pro share, so the urgent fee is not added to it (a pre-start cancel refunds the fee, so nothing is kept for it).
create or replace function public.claim_due_payments(p_limit integer default 20)
returns table (
  payment_id uuid,
  job_id uuid,
  payment_intent_id text,
  amount_minor bigint,
  amount_dop integer,
  pro_payout_dop integer,
  net_payout_dop integer,
  recovery_dop integer,
  pro_account_id text
)
language plpgsql
set search_path to ''
as $$
declare
  c record;
  v_recovery integer;
begin
  for c in
    select p.id as pid, p.job_id as jid, p.stripe_payment_intent_id as pi,
           coalesce(p.keep_minor, p.amount_minor) as amt_minor,
           coalesce(p.keep_dop, p.amount_dop) as amt_dop,
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop + p.urgent_fee_pro_dop) as gross,
           pr.stripe_account_id as acct
      from public.payments p
      join public.jobs j on j.id = p.job_id
      join public.pros pr on pr.id = j.pro_id
     where p.status = 'held'
       and (
         (j.status = 'completed' and p.release_after <= now())
         or (j.status = 'cancelled' and p.keep_pro_payout_dop is not null
             and p.cancel_fee_release_after is not null and p.cancel_fee_release_after <= now())
       )
     order by coalesce(p.cancel_fee_release_after, p.release_after)
     limit greatest(1, least(p_limit, 50))
       for update of p skip locked
  loop
    v_recovery := public.net_pro_recoveries(c.pid);
    payment_id := c.pid;
    job_id := c.jid;
    payment_intent_id := c.pi;
    amount_minor := c.amt_minor;
    amount_dop := c.amt_dop;
    pro_payout_dop := c.gross;
    recovery_dop := v_recovery;
    net_payout_dop := c.gross - v_recovery;
    pro_account_id := c.acct;
    return next;
  end loop;
end;
$$;

-- 12. Grants for the new objects. Existing grants on redefined functions stay in place.
revoke all on function public.jobs_guard_urgent() from public, anon, authenticated;
revoke all on function public.pros_guard_urgent() from public, anon, authenticated;

-- 13. list_pro_cards: 0115 body plus urgent_available as the last column, so the picker can sort on it.
-- Return type changes, so the function is dropped and recreated, then re-granted (same as 0115 section 5).
drop function if exists public.list_pro_cards(text, text, uuid, text, text);
create or replace function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo',
                                      p_pro_type text default null)
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean, is_demo boolean,
              pro_type text, razon_social text, price_unit text, urgent_available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, pr.full_name, p.trade, p.zone, p.price_min_dop, p.price_max_dop, p.plan, p.verified_at,
         (select f.storage_path from public.pro_files f
           where f.pro_id = p.id and f.kind = 'avatar' and f.review_status = 'approved'
           order by f.created_at desc limit 1) as avatar_path,
         p.bio,
         (p.verified_at is not null) as identity_verified,
         (pr.email_verified_at is not null) as email_verified,
         (pr.phone is not null) as phone_verified,
         p.available,
         p.is_demo,
         p.pro_type,
         case when p.pro_type = 'company'
              then (select c.razon_social from public.pro_companies c where c.pro_id = p.id)
         end as razon_social,
         p.price_unit,
         p.urgent_available
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.closed_at is null
    and (p_pro_id is not null or p.city = p_city)
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
    and (p_pro_type is null or p_pro_type = 'any' or p.pro_type = p_pro_type)
    and (not p.is_demo or p_pro_id is not null)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke all on function public.list_pro_cards(text, text, uuid, text, text) from public;
grant execute on function public.list_pro_cards(text, text, uuid, text, text) to anon, authenticated, service_role;

-- 14. The pro reads their own flag (OWN_PRO_COLUMNS), as 0115 does for price_unit.
grant select (urgent_available) on public.pros to authenticated;

-- 15. Public read of the fee amount only, so the request form can show it before the job exists.
-- The platform_settings table itself stays closed to clients (0108).
create or replace function public.public_urgent_fee()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.urgent_fee_setting();
$$;
revoke all on function public.public_urgent_fee() from public;
grant execute on function public.public_urgent_fee() to anon, authenticated;

-- 16. Pro earnings and annual statement include the whole urgent fee (0117). Bodies from 0108, with
-- the pro's share written as pro_payout_dop + urgent_fee_pro_dop wherever a payout is summed.
-- A kept cancel fee already holds its own pro share, so the urgent fee is not added to it.
create or replace function public.pro_annual_statement(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pro uuid := (select auth.uid());
  v_tz constant text := 'America/Santo_Domingo';
  v_lines jsonb;
  v_totals jsonb;
  v_pending numeric;
begin
  if not exists (select 1 from public.pros where id = v_pro) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Año no válido.' using errcode = '22023';
  end if;

  with released as (
    select p.id,
           to_char(coalesce(p.released_at, p.created_at) at time zone v_tz, 'YYYY-MM-DD') as released_on,
           j.trade,
           j.zone,
           (j.status = 'cancelled') as is_fee,
           p.commission_waived as waived,
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop + p.urgent_fee_pro_dop, 0) as net,
           coalesce(p.keep_commission_dop, p.commission_dop, 0) as commission,
           coalesce(p.tip_dop, 0) as tip
      from public.payments p
      join public.jobs j on j.id = p.job_id
     where j.pro_id = v_pro
       and p.purpose in ('job', 'diagnostic', 'revision')
       and p.status = 'released'
       and extract(year from coalesce(p.released_at, p.created_at) at time zone v_tz) = p_year
  ),
  lines as (
    select r.id, r.released_on, r.trade, r.zone, r.is_fee, r.waived,
           case when r.is_fee then r.net else r.net + r.commission - r.tip end as gross,
           case when r.is_fee then 0 else r.commission end as commission,
           case when r.is_fee then 0 else r.tip end as tip,
           r.net
      from released r
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'kind', case when l.is_fee then 'fee' else 'job' end,
      'waived', l.waived,
      'released_on', l.released_on,
      'trade', l.trade,
      'zone', l.zone,
      'gross', l.gross,
      'commission', l.commission,
      'tip', l.tip,
      'net', l.net
    ) order by l.released_on, l.id), '[]'::jsonb),
    jsonb_build_object(
      'gross', coalesce(sum(l.gross), 0),
      'commission', coalesce(sum(l.commission), 0),
      'tips', coalesce(sum(l.tip), 0),
      'net', coalesce(sum(l.net), 0),
      'fees', coalesce(sum(l.net) filter (where l.is_fee), 0)
    )
  into v_lines, v_totals
  from lines l;

  select coalesce(sum(coalesce(p.keep_pro_payout_dop, p.pro_payout_dop + p.urgent_fee_pro_dop, 0)), 0)
    into v_pending
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where j.pro_id = v_pro
     and p.purpose in ('job', 'diagnostic', 'revision')
     and p.status in ('held', 'disputed')
     and extract(year from p.created_at at time zone v_tz) = p_year;

  return jsonb_build_object(
    'year', p_year,
    'totals', v_totals,
    'pending', v_pending,
    'lines', v_lines
  );
end;
$$;
create or replace function public.pro_earnings_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pro uuid := (select auth.uid());
  v_tz constant text := 'America/Santo_Domingo';
  v_this text := to_char(now() at time zone v_tz, 'YYYY-MM');
  v_last text := to_char((now() at time zone v_tz) - interval '1 month', 'YYYY-MM');
  v_result jsonb;
begin
  if not exists (select 1 from public.pros where id = v_pro) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  with pay as (
    select p.status,
           p.commission_waived as waived,
           coalesce(p.released_at, p.created_at) as dated_at,
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop + p.urgent_fee_pro_dop, 0) as net
      from public.payments p
      join public.jobs j on j.id = p.job_id
     where j.pro_id = v_pro
       and p.purpose in ('job', 'diagnostic', 'revision')
  ),
  released as (
    select to_char(dated_at at time zone v_tz, 'YYYY-MM') as m, net
      from pay
     where status = 'released'
  ),
  months as (
    select to_char((now() at time zone v_tz) - make_interval(months => g), 'YYYY-MM') as m
      from generate_series(0, 5) as g
  )
  select jsonb_build_object(
    'this_month', coalesce((select sum(net) from released where m = v_this), 0),
    'last_month', coalesce((select sum(net) from released where m = v_last), 0),
    'all_time',   coalesce((select sum(net) from released), 0),
    'pending',    coalesce((select sum(net) from pay where status in ('held', 'disputed')), 0),
    'first_job_waived_dop', coalesce((select sum(net) from pay where waived and status = 'released'), 0),
    'monthly', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'month', x.m,
                 'amount', coalesce((select sum(r.net) from released r where r.m = x.m), 0)
               )
               order by x.m
             )
        from months x
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- 17. Partial dispute keeps the urgent fee (0117, amendment). Body from 0108 resolve_dispute, changed in the
-- pre-release partial branch only:
--   * The refund may not exceed amount - urgent fee. The fee is never refunded by a partial outcome.
--   * Kept quote basis = kept cash - fee + referral + promo. The fee is outside the commission base, so the
--     kept commission on the charged part is unchanged.
--   * keep_pro_payout_dop = kept quote - kept commission + fee (the fee in full).
--   * keep_dop (kept cash, including the fee) and keep_pro + keep_commission stay on the 0095 keep identity:
--       keep_pro_payout_dop + keep_commission_dop = keep_dop + referral_discount_dop + discount_dop
--     which holds because keep_pro now carries the fee.
-- A full refund (pre-release) refunds amount_dop, the fee included, exactly like the tip. Post-release refunds
-- come from the guarantee reserve and are not changed here.
create or replace function public.resolve_dispute(p_dispute uuid, p_outcome text, p_refund_dop integer default null::integer, p_reason text default null::text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  d record;
  p record;
  j record;
  v_pro uuid;
  v_plan text;
  v_rate integer;
  v_refund_dop integer;
  v_refund_minor bigint;
  v_kept_dop integer;
  v_kept_minor bigint;
  v_quote integer;
  v_kept_quote integer;
  v_kept_comm integer;
  v_kept_payout integer;
  v_balance bigint;
  v_other uuid;
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede resolver una disputa.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe la razón de la decisión (mínimo 10 caracteres).';
  end if;

  select * into d from public.disputes where id = p_dispute for update;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if d.status <> 'open' or d.stage <> 'evidence' then raise exception 'La disputa ya fue decidida.'; end if;
  if now() < d.evidence_due_at then raise exception 'La ventana de evidencia aún no vence.'; end if;

  select * into p from public.payments where id = d.payment_id for update;
  select * into j from public.jobs where id = d.job_id;
  v_pro := j.pro_id;
  select plan into v_plan from public.pros where id = v_pro;

  if d.phase = 'pre_release' then
    if p.status <> 'disputed' then raise exception 'El pago no está congelado.'; end if;

    if p_outcome = 'release_full' then
      update public.payments set status = 'held' where id = p.id;

    elsif p_outcome = 'full_refund' then
      v_refund_dop := p.amount_dop;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, p.amount_minor, 'dispute_full', d.id);

    elsif p_outcome = 'partial_refund' then
      if p_refund_dop is null or p_refund_dop <= 0 or p_refund_dop >= p.amount_dop then
        raise exception 'El reembolso parcial debe ser mayor que cero y menor que el monto del trabajo.';
      end if;
      -- Urgent fee (0117): the pro keeps the whole fee, so the refund cannot reach into it.
      if p_refund_dop > p.amount_dop - coalesce(p.urgent_fee_dop, 0) then
        raise exception 'El reembolso parcial no puede incluir la tarifa urgente, que queda con el profesional.';
      end if;
      v_refund_dop := p_refund_dop;
      v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
      -- Client's kept cash (charged basis).
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;
      -- Quote basis: the referral discount is part of the job price the pro earns on.
      -- Urgent fee (0117): the fee is outside the charged part, so it is outside both quote bases.
      v_quote := p.amount_dop - coalesce(p.urgent_fee_dop, 0) + (coalesce(p.referral_discount_dop, 0) + coalesce(p.discount_dop, 0));
      v_kept_quote := v_kept_dop - coalesce(p.urgent_fee_dop, 0) + (coalesce(p.referral_discount_dop, 0) + coalesce(p.discount_dop, 0));

      v_rate := case
        when j.job_type = 'diagnostic' then 15
        when v_plan = 'pro' then 8
        when v_quote < 5000 then 15
        when v_quote <= 25000 then 12
        else 10
      end;
      v_kept_comm := floor((v_kept_quote * v_rate * 2 + 100) / 200);
      if j.job_type = 'repair' and v_plan <> 'pro' and v_kept_comm < 400 then
        v_kept_comm := 400;
      end if;
      if j.job_type = 'repair' and v_kept_comm > 15000 then
        v_kept_comm := 15000;
      end if;
      -- First-job waiver (0108): a waived payment keeps no commission at any kept amount.
      if p.commission_waived then
        v_kept_comm := 0;
      end if;
      v_kept_comm := least(v_kept_comm, v_kept_quote);
      -- The kept urgent fee joins the pro's kept share in full. It is never commissioned.
      v_kept_payout := v_kept_quote - v_kept_comm + coalesce(p.urgent_fee_dop, 0);

      update public.payments
         set keep_dop = v_kept_dop,
             keep_minor = v_kept_minor,
             keep_pro_payout_dop = v_kept_payout,
             keep_commission_dop = v_kept_comm
       where id = p.id;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'dispute_partial', d.id);

    elsif p_outcome = 'redo' then
      null;

    else
      raise exception 'Resultado no válido.';
    end if;

  else
    if p.status <> 'released' then raise exception 'El pago ya no está liberado.'; end if;
    if p_outcome = 'full_refund' then
      v_refund_dop := p.amount_dop;
    elsif p_outcome = 'partial_refund' then
      v_refund_dop := p_refund_dop;
    else
      raise exception 'Después de la liberación solo hay reembolso desde la reserva.';
    end if;
    if v_refund_dop is null or v_refund_dop <= 0 or v_refund_dop > p.amount_dop then
      raise exception 'El reembolso excede el monto del trabajo.';
    end if;

    lock table public.guarantee_reserve in share row exclusive mode;
    select coalesce(sum(case when entry_kind = 'funding' then amount_dop else -amount_dop end), 0)
      into v_balance from public.guarantee_reserve;
    if v_balance < v_refund_dop then raise exception 'Reserva de garantía insuficiente.'; end if;

    v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
    values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'guarantee_refund', d.id);
    insert into public.pro_recoveries (pro_id, dispute_id, amount_dop)
    values (v_pro, d.id, v_refund_dop);
  end if;

  update public.disputes
     set decided_at = now(),
         decided_by = (select auth.uid()),
         decision_reason = trim(p_reason),
         outcome = p_outcome,
         refund_dop = v_refund_dop,
         stage = case when p_outcome = 'redo' then 'decided' else 'executed' end
   where id = d.id;

  -- Audit: one row per decision, in the Bitácora (admin_audit_log via admin_log).
  -- keep = charged amount minus refund. Redo keeps the full amount on hold until the redo is approved.
  perform public.admin_log(
    'dispute_decided',
    d.id,
    jsonb_build_object(
      'dispute_id', d.id,
      'payment_id', d.payment_id,
      'job_id', d.job_id,
      'phase', d.phase,
      'outcome', case p_outcome
                   when 'release_full' then 'release'
                   when 'partial_refund' then 'partial_refund'
                   when 'full_refund' then 'full_refund'
                   when 'redo' then 'redo'
                 end,
      'outcome_raw', p_outcome,
      'refund_dop', coalesce(v_refund_dop, 0),
      'keep_dop', p.amount_dop - coalesce(v_refund_dop, 0),
      'reason', trim(p_reason)
    )
  );

  if p_outcome = 'redo' then
    return 'redo_pending';
  end if;

  update public.disputes
     set status = case when p_outcome = 'release_full' then 'resolved_pro' else 'resolved_homeowner' end,
         resolved_at = now()
   where id = d.id;

  insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
  select d.id, x, 'decision', 'La disputa fue decidida. Motivo: ' || trim(p_reason) || ' Esta decisión es final en la plataforma.'
    from unnest(array[j.homeowner_id, j.pro_id]) as x
   where x is not null;

  return 'resolved';
end;
$function$;
