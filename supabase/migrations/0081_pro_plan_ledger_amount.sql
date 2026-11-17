-- 0081: Pro plan ledger records what Stripe charged, and ending a plan clears the paid period end.
--
-- Changes to apply_pro_plan_event (from 0080):
--  1. New parameter p_amount_paid_minor (invoice.amount_paid, USD minor units).
--     The ledger amount now comes from what was charged, not from the plan price in metadata.
--  2. A paid invoice with amount_paid = 0 (proration-only, e.g. a billing-anchor reset) writes no
--     ledger row, because the ledger requires a positive amount. It still extends the period.
--  3. 'ended' clears plan_current_period_end. A free account carries no paid-period date.
--
-- Deploy order: apply this migration BEFORE deploying the stripe-webhook function that passes
-- p_amount_paid_minor. The old function signature is dropped here, so an old webhook would fail.
--
-- Unchanged: price check (metadata amount_dop must be 2950), eligibility rules, idempotency via
-- stripe_events and the unique stripe_invoice_id, service-role-only execute.

drop function if exists public.apply_pro_plan_event(text, text, boolean, text, uuid, text, text, timestamptz, integer, bigint, numeric);

create or replace function public.apply_pro_plan_event(
  p_event_id text, p_event_type text, p_livemode boolean,
  p_kind text,                 -- 'activated' | 'paid' | 'ended'
  p_pro uuid,
  p_subscription_id text,
  p_invoice_id text,           -- null unless kind = 'paid'
  p_period_end timestamptz,    -- null unless kind = 'paid'
  p_amount_dop integer,        -- plan price in DOP, from metadata (must be 2950)
  p_amount_minor bigint,       -- plan price in USD minor units, from metadata
  p_amount_paid_minor bigint,  -- invoice.amount_paid in USD minor units (0 for proration-only)
  p_fx numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pro record;
  v_now timestamptz := now();
  v_reason text;
  v_status text;
  v_end timestamptz;
  v_paid_dop integer;
begin
  insert into public.stripe_events (id, type, livemode)
    values (p_event_id, p_event_type, p_livemode)
    on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  if p_kind not in ('activated', 'paid', 'ended') then
    raise exception 'Evento de plan no válido.';
  end if;

  select id, plan, verification_status, suspended_at, plan_stripe_subscription_id
    into v_pro from public.pros where id = p_pro for update;
  if not found then raise exception 'Profesional no encontrado.'; end if;

  -- Subscription end: back to the free plan. The paid period is not refunded. Clear the period end.
  if p_kind = 'ended' then
    if v_pro.plan_stripe_subscription_id is not distinct from p_subscription_id then
      update public.pros
         set plan = 'free', plan_stripe_subscription_id = null, plan_current_period_end = null
       where id = p_pro;
      update public.stripe_events set processed_at = v_now where id = p_event_id;
      return 'ended';
    end if;
    update public.stripe_events set processed_at = v_now where id = p_event_id;
    return 'ignored_other_subscription';
  end if;

  if p_amount_dop is distinct from 2950 then
    raise exception 'Precio de plan no válido.';
  end if;

  if v_pro.verification_status <> 'approved' then
    v_reason := 'not_approved';
  elsif v_pro.suspended_at is not null then
    v_reason := 'blocked';
  elsif v_pro.plan_stripe_subscription_id is not null
     and v_pro.plan_stripe_subscription_id <> p_subscription_id then
    v_reason := 'already_subscribed';
  end if;

  if p_kind = 'activated' then
    -- The first invoice event records the payment. Activation here only when it is eligible.
    if v_reason is not null then
      update public.stripe_events set processed_at = v_now where id = p_event_id;
      return v_reason;
    end if;
    v_end := v_now + interval '1 month';
  else
    v_end := p_period_end;
    if v_end is null then raise exception 'Falta el fin del periodo.'; end if;
  end if;

  if p_kind = 'paid' and coalesce(p_amount_paid_minor, 0) > 0 then
    -- DOP actually charged, from the USD amount paid and the FX rate sent in metadata.
    v_paid_dop := round(p_amount_paid_minor * p_fx / 100.0);
    v_status := case when v_reason is null then 'paid' else 'refund_due' end;
    insert into public.pro_plan_payments (
      pro_id, stripe_invoice_id, stripe_subscription_id, amount_dop, amount_minor,
      fx_rate_dop_per_usd, period_end, status, flag_reason
    ) values (
      p_pro, p_invoice_id, p_subscription_id, v_paid_dop, p_amount_paid_minor,
      p_fx, p_period_end, v_status, v_reason
    )
    on conflict (stripe_invoice_id) do nothing;
    if not found then
      update public.stripe_events set processed_at = v_now where id = p_event_id;
      return 'duplicate';
    end if;
    if v_reason is not null then
      update public.stripe_events set processed_at = v_now where id = p_event_id;
      return 'refund_due';
    end if;
  end if;

  update public.pros
     set plan = 'pro',
         plan_stripe_subscription_id = p_subscription_id,
         plan_activated_at = coalesce(plan_activated_at, v_now),
         plan_current_period_end = greatest(coalesce(plan_current_period_end, '-infinity'::timestamptz), v_end)
   where id = p_pro;

  update public.stripe_events set processed_at = v_now where id = p_event_id;
  return case when p_kind = 'paid' and coalesce(p_amount_paid_minor, 0) = 0 then 'paid_zero' else p_kind end;
end;
$function$;

revoke all on function public.apply_pro_plan_event(text, text, boolean, text, uuid, text, text, timestamptz, integer, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.apply_pro_plan_event(text, text, boolean, text, uuid, text, text, timestamptz, integer, bigint, bigint, numeric) to service_role;
