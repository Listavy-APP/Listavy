-- 0024 · Tips on Checkout (D2).
-- A tip is paid with the job and goes 100% to the pro. It carries no commission.
-- amount_dop = (quote - diagnostic credit) + tip; pro_payout_dop = job payout + tip.
-- The tip cap is 20% of the agreed job price (the quote). The app enforces it in
-- stripe-checkout (validateTip); this function enforces it again so a bad tip cannot be stored.
-- Rounding matches the app: half up to the peso, integer arithmetic.

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
  v_expected integer;
  v_tip_cap integer;
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

  if p_tip_dop is null or p_tip_dop < 0 then raise exception 'La propina no es válida.'; end if;
  -- Half-up 20% of the quote: floor((quote * 20 * 2 + 100) / 200).
  v_tip_cap := (v_quote * 40 + 100) / 200;
  if p_tip_dop > v_tip_cap then raise exception 'La propina supera el 20 por ciento del trabajo.'; end if;

  if p_amount_dop <> v_expected + p_tip_dop then
    raise exception 'El monto cobrado no coincide con la cotización menos el crédito, más la propina.';
  end if;

  insert into public.payments (
    job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, commission_dop,
    status, amount_dop, pro_payout_dop, tip_dop, purpose,
    stripe_checkout_session_id, stripe_payment_intent_id, held_at
  ) values (
    p_job, 'stripe', 'USD', p_amount_minor, p_fx, p_commission_dop,
    'held', p_amount_dop, p_pro_payout_dop, p_tip_dop, p_purpose,
    p_session_id, p_payment_intent_id, now()
  );

  update public.jobs set payment_status = 'paid' where id = p_job;
  update public.stripe_events set processed_at = now() where id = p_event_id;
  return 'applied';
end;
$function$;
