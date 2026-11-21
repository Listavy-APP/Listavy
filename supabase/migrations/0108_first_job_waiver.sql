-- 0108: first-job commission waiver (Item 11). Money item. Unapplied until Sam applies it.
-- Rule (Fabian, 2026-11-21): a pro's first paid job (repair or diagnostic) keeps 100% of the job amount.
--   * One time per pro. Enforced by the primary key on pro_launch_waivers.
--   * Platform switch first_job_free_enabled (default ON, super admin, logged to admin_log).
--   * The switch being off still uses the pro's slot (reason 'off'). Turning it on later does not waive it.
--   * A payment fully refunded before release frees the slot. After release, refunds never free it.
--   * Pros with any payment before this migration are excluded (reason 'pre_launch').
--   * A waived payment keeps 0 commission at any kept amount. Tips stay with the pro.

-- 1. Columns and tables.
alter table public.payments add column if not exists commission_waived boolean not null default false;

create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
insert into public.platform_settings (key, value) values ('first_job_free_enabled', '{"enabled": true}')
  on conflict (key) do nothing;

create table if not exists public.pro_launch_waivers (
  pro_id     uuid primary key references public.pros(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete restrict,
  reason     text not null check (reason in ('waived', 'off', 'pre_launch')),
  created_at timestamptz not null default now(),
  check ((reason = 'pre_launch') = (payment_id is null))
);
alter table public.pro_launch_waivers enable row level security;
revoke all on public.pro_launch_waivers from public, anon, authenticated;

-- 2. Backfill: a pro with any payment before this migration is not a launch pro. No retroactive waiver.
insert into public.pro_launch_waivers (pro_id, payment_id, reason)
  select distinct j.pro_id, null::uuid, 'pre_launch'
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where j.pro_id is not null
  on conflict (pro_id) do nothing;

-- 3. Switch. Fails closed (off) if the row is missing.
create or replace function public.first_job_free_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value->>'enabled')::boolean from public.platform_settings where key = 'first_job_free_enabled'), false);
$$;
revoke all on function public.first_job_free_enabled() from public, anon, authenticated;

create or replace function public.admin_get_first_job_free()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('enabled', (value->>'enabled')::boolean, 'updated_at', updated_at)
            from public.platform_settings where key = 'first_job_free_enabled');
end;
$$;

create or replace function public.admin_set_first_job_free(p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() or not public.is_super_admin() then
    raise exception 'Solo un super administrador puede cambiar la promoción.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Valor no válido.' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  update public.platform_settings
     set value = jsonb_build_object('enabled', p_enabled), updated_at = now(), updated_by = (select auth.uid())
   where key = 'first_job_free_enabled';
  perform public.admin_log('first_job_free_changed', null,
    jsonb_build_object('enabled', p_enabled, 'reason', trim(p_reason)));
end;
$$;
revoke all on function public.admin_get_first_job_free() from public, anon;
grant execute on function public.admin_get_first_job_free() to authenticated;
revoke all on function public.admin_set_first_job_free(boolean, text) from public, anon;
grant execute on function public.admin_set_first_job_free(boolean, text) to authenticated;

-- 4. Redefined functions (each copied from its latest definition, with the change marked 0108).
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

  if p_tip_dop is null or p_tip_dop < 0 then raise exception 'La propina no es válida.'; end if;
  -- Half-up 20% of the quote: floor((quote * 20 * 2 + 100) / 200).
  v_tip_cap := (v_quote * 40 + 100) / 200;
  if p_tip_dop > v_tip_cap then raise exception 'La propina supera el 20 por ciento del trabajo.'; end if;

  if p_amount_dop <> v_expected + p_tip_dop then
    raise exception 'El monto cobrado no coincide con la cotización menos el crédito y el descuento, más la propina.';
  end if;

  insert into public.payments (
    job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, commission_dop,
    status, amount_dop, pro_payout_dop, tip_dop, purpose,
    stripe_checkout_session_id, stripe_payment_intent_id, held_at, referral_discount_dop,
    discount_dop, promo_code_id
  ) values (
    p_job, 'stripe', 'USD', p_amount_minor, p_fx, p_commission_dop,
    'held', p_amount_dop, p_pro_payout_dop, p_tip_dop, p_purpose,
    p_session_id, p_payment_intent_id, now(), v_discount,
    v_promo_dop, v_promo
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

create or replace function public.mark_refund_succeeded(p_refund uuid, p_stripe_refund text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
  pm record;
begin
  update public.refunds
     set status = 'succeeded', stripe_refund_id = p_stripe_refund, processed_at = now()
   where id = p_refund and status = 'pending'
   returning * into r;
  if not found then return 'skipped'; end if;

  if r.reason = 'dispute_partial' then
    update public.payments
       set status = 'held', refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id;
  elsif r.reason = 'guarantee_refund' then
    update public.payments
       set refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id
     returning * into pm;
    insert into public.guarantee_reserve (entry_kind, amount_dop, dispute_id)
    values ('draw', r.amount_dop, r.dispute_id);
    if pm.refunded_minor >= pm.amount_minor then
      update public.jobs set payment_status = 'refunded' where id = r.job_id;
    end if;
  elsif r.reason = 'client_cancel_fee' then
    -- The primary's non-fee part. The fee stays held for the pro.
    update public.payments
       set refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id;
  elsif r.reason = 'fee_reversed' then
    update public.payments
       set refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id
     returning * into pm;
    if pm.refunded_minor >= pm.amount_minor then
      update public.payments set status = 'refunded' where id = pm.id;
      update public.jobs set payment_status = 'refunded' where id = r.job_id;
    end if;
  else
    update public.payments
       set status = 'refunded', refunded_minor = r.amount_minor
     where id = r.payment_id;
    update public.jobs set payment_status = 'refunded' where id = r.job_id;
  end if;

  -- First-job slot (0108): a payment fully refunded before release never paid out, so the slot is freed.
  if exists (select 1 from public.payments where id = r.payment_id and status = 'refunded' and released_at is null) then
    delete from public.pro_launch_waivers where payment_id = r.payment_id;
    update public.payments set commission_waived = false where id = r.payment_id;
  end if;

  perform public.admin_log(
    'refund_processed',
    p_refund,
    jsonb_build_object(
      'refund_id', p_refund,
      'payment_id', r.payment_id,
      'job_id', r.job_id,
      'amount_dop', r.amount_dop,
      'reason', r.reason,
      'dispute_id', r.dispute_id,
      'stripe_refund_id', p_stripe_refund
    )
  );
  return 'succeeded';
end;
$$;

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
      v_refund_dop := p_refund_dop;
      v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
      -- Client's kept cash (charged basis).
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;
      -- Quote basis: the referral discount is part of the job price the pro earns on.
      v_quote := p.amount_dop + (coalesce(p.referral_discount_dop, 0) + coalesce(p.discount_dop, 0));
      v_kept_quote := v_kept_dop + (coalesce(p.referral_discount_dop, 0) + coalesce(p.discount_dop, 0));

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
      v_kept_payout := v_kept_quote - v_kept_comm;

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
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop, 0) as net,
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

  select coalesce(sum(coalesce(p.keep_pro_payout_dop, p.pro_payout_dop, 0)), 0)
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
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop, 0) as net
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
