-- apply_stripe_checkout now sets stripe_events.processed_at when it applies an event.
-- The insert at the top still records receipt and blocks duplicates. A failure
-- anywhere in the function rolls the whole row back, so a retry stays safe.
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

  if p_amount_dop <> v_expected then
    raise exception 'El monto cobrado no coincide con la cotización menos el crédito.';
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
