-- Sprint 3 (money), TEST mode. NOT applied to production until approved.
-- 1. Diagnostic credit link: a repair job points at the paid diagnostic it follows.
-- 2. apply_stripe_checkout: the webhook's only write path for a completed Checkout.
--    Idempotent by Stripe event id; the whole effect is one transaction.

-- 1. Link column, one repair per diagnostic.
alter table public.jobs
  add column if not exists credit_from_job_id uuid references public.jobs (id);

create unique index if not exists jobs_one_repair_per_diagnostic
  on public.jobs (credit_from_job_id) where credit_from_job_id is not null;

-- The link must point at a paid diagnostic of the same homeowner and trade.
create or replace function public.jobs_credit_link_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d record;
begin
  if new.credit_from_job_id is null then return new; end if;

  if new.job_type <> 'repair' then
    raise exception 'Solo una reparación puede usar un crédito de diagnóstico.';
  end if;

  select job_type, homeowner_id, trade, payment_status
    into d from public.jobs where id = new.credit_from_job_id;
  if not found then raise exception 'Diagnóstico no encontrado.'; end if;
  if d.job_type <> 'diagnostic' then raise exception 'El crédito debe venir de un diagnóstico.'; end if;
  if d.homeowner_id <> new.homeowner_id or d.trade <> new.trade then
    raise exception 'El diagnóstico no corresponde a esta reparación.';
  end if;
  if d.payment_status not in ('paid', 'held', 'released') then
    raise exception 'El diagnóstico no está pagado.';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_credit_link_guard on public.jobs;
create trigger jobs_credit_link_guard
  before insert or update of credit_from_job_id, job_type on public.jobs
  for each row execute function public.jobs_credit_link_guard();

-- 2. Webhook apply. Service role only.
-- The amount must equal the approved quote, minus the diagnostic payment when a credit applies.
-- Commission and payout are computed in the Edge Function from the tested domain module,
-- and the table's split constraint checks them here.
create or replace function public.apply_stripe_checkout(
  p_event_id          text,
  p_event_type        text,
  p_livemode          boolean,
  p_job               uuid,
  p_session_id        text,
  p_payment_intent_id text,
  p_purpose           text,
  p_amount_minor      bigint,
  p_fx                numeric,
  p_amount_dop        integer,
  p_commission_dop    integer,
  p_pro_payout_dop    integer,
  p_tip_dop           integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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
  return 'applied';
end;
$$;

revoke execute on function public.apply_stripe_checkout(text, text, boolean, uuid, text, text, text, bigint, numeric, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.apply_stripe_checkout(text, text, boolean, uuid, text, text, text, bigint, numeric, integer, integer, integer, integer) to service_role;
