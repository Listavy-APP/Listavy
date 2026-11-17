-- Listavy · 0080 · Pro plan subscription (RD$2,950/mes, Stripe test mode first).
-- STATUS: WRITTEN, NOT APPLIED. Needs Sam's review and Fabian's approval before apply.
--
-- What this does
--  1. Adds subscription columns to pros. pros.plan stays the single flag the commission
--     and dispute SQL read ('pro' = 8%, minimum waived). This migration does not add an expiry check.
--  2. Adds pro_plan_payments: one row per Stripe invoice for the plan. Ledger for retention and refunds.
--  3. Adds apply_pro_plan_event(): idempotent writer for checkout activation, each paid invoice,
--     and subscription end. Service role only.
--  4. Extends guard_pro_privileges so an owner cannot set the new columns. Otherwise unchanged from 0071.
--
-- Rules encoded
--  - Price must be 2950 DOP. Anything else raises.
--  - Activation needs approved and not suspended. A paid invoice for an ineligible pro is recorded as refund_due,
--    not activated. Refund is manual (see report).
--  - One live plan subscription per pro. A second subscription is recorded as refund_due.
--  - Ending (customer.subscription.deleted) sets plan = 'free'. No refund of a paid period.

-- 1. Columns
alter table public.pros
  add column if not exists plan_stripe_subscription_id text,
  add column if not exists plan_current_period_end timestamptz,
  add column if not exists plan_activated_at timestamptz;

-- 2. Ledger
create table if not exists public.pro_plan_payments (
  id                     uuid primary key default gen_random_uuid(),
  pro_id                 uuid not null references public.pros(id),
  stripe_invoice_id      text not null unique,
  stripe_subscription_id text not null,
  amount_dop             integer not null check (amount_dop > 0),
  amount_minor           bigint not null check (amount_minor > 0),
  fx_rate_dop_per_usd    numeric(12,4) not null,
  period_end             timestamptz,
  status                 text not null check (status in ('paid', 'refund_due')),
  flag_reason            text,
  created_at             timestamptz not null default now()
);
create index if not exists pro_plan_payments_pro_idx on public.pro_plan_payments (pro_id, created_at desc);

alter table public.pro_plan_payments enable row level security;
revoke all on public.pro_plan_payments from anon, authenticated;
grant select on public.pro_plan_payments to authenticated;
create policy pro_plan_payments_read on public.pro_plan_payments
  for select to authenticated
  using (pro_id = auth.uid() or public.is_admin());

-- 3. Guard: owners cannot change the subscription columns.
create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       and not (old.verification_status = 'rejected' and new.verification_status = 'pending') then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan
       or new.plan_stripe_subscription_id is distinct from old.plan_stripe_subscription_id
       or new.plan_current_period_end is distinct from old.plan_current_period_end
       or new.plan_activated_at is distinct from old.plan_activated_at then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.rejection_reason is distinct from old.rejection_reason
       and not (new.verification_status = 'pending' and new.rejection_reason is null) then
      raise exception 'Solo un administrador puede registrar el motivo.';
    end if;
    if new.pro_free_until is distinct from old.pro_free_until
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'El mes gratis lo asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;

-- 4. Idempotent writer. Called only by the stripe-webhook function (service role).
create or replace function public.apply_pro_plan_event(
  p_event_id text, p_event_type text, p_livemode boolean,
  p_kind text,                 -- 'activated' | 'paid' | 'ended'
  p_pro uuid,
  p_subscription_id text,
  p_invoice_id text,           -- null unless kind = 'paid'
  p_period_end timestamptz,    -- null unless kind = 'paid'
  p_amount_dop integer,
  p_amount_minor bigint,
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

  -- Subscription end: back to the free plan. The paid period is not refunded.
  if p_kind = 'ended' then
    if v_pro.plan_stripe_subscription_id is not distinct from p_subscription_id then
      update public.pros set plan = 'free', plan_stripe_subscription_id = null where id = p_pro;
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

  if p_kind = 'paid' then
    v_status := case when v_reason is null then 'paid' else 'refund_due' end;
    insert into public.pro_plan_payments (
      pro_id, stripe_invoice_id, stripe_subscription_id, amount_dop, amount_minor,
      fx_rate_dop_per_usd, period_end, status, flag_reason
    ) values (
      p_pro, p_invoice_id, p_subscription_id, p_amount_dop, p_amount_minor,
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
  return p_kind;
end;
$function$;

revoke all on function public.apply_pro_plan_event(text, text, boolean, text, uuid, text, text, timestamptz, integer, bigint, numeric) from public, anon, authenticated;
grant execute on function public.apply_pro_plan_event(text, text, boolean, text, uuid, text, text, timestamptz, integer, bigint, numeric) to service_role;
