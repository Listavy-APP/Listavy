-- 0107: cancellation fee (RD$300 to the pro, 2-hour grace). Unapplied until Sam applies it.
-- Rules:
--   * Client cancels an accepted job whose earliest held job payment (the primary) is more than 2 hours old:
--     the primary refunds (paid - fee), the fee is kept for the pro, and every other held payment refunds in full.
--   * Inside 2 hours, or before acceptance: full refund (unchanged).
--   * Pro cancels: full refund, strike (unchanged).
--   * Client no-show after the pro marks arrival: same grace rule as a late cancel.
--   * The fee is kept on the primary payment (keep_dop / keep_minor / keep_pro_payout_dop = fee, keep_commission_dop = 0).
--     It releases 48 hours after the cancellation, unless a fee dispute is open. The client may dispute the fee for those 48 hours.
--   * Fee dispute outcomes: fee_uphold (fee releases) or fee_reverse (fee refunded to the client). The job is not reopened.

-- 1. Columns.
alter table public.jobs add column if not exists arrived_at timestamptz;
alter table public.payments add column if not exists cancel_fee_release_after timestamptz;
alter table public.disputes add column if not exists fee_dispute boolean not null default false;
alter table public.disputes drop constraint if exists disputes_outcome_check;
alter table public.disputes add constraint disputes_outcome_check check (outcome in (
  'release_full', 'partial_refund', 'full_refund', 'redo', 'fee_uphold', 'fee_reverse'));

-- 2. Refund reasons. One pending or succeeded refund per payment, except fee reversals (a separate dispute outcome).
alter table public.refunds drop constraint if exists refunds_reason_check;
alter table public.refunds add constraint refunds_reason_check check (reason in (
  'client_cancel_pre_work', 'pro_cancel', 'dispute_full', 'dispute_partial', 'guarantee_refund',
  'client_cancel_fee', 'client_no_show', 'fee_reversed'));
drop index if exists public.refunds_one_per_payment;
create unique index refunds_one_per_payment on public.refunds (payment_id)
  where status in ('pending', 'succeeded') and reason <> 'fee_reversed';

-- 3. Pro arrival. Server timestamp only. Idempotent.
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
  end if;
end;
$$;

-- 4. Shared settlement: refunds and the fee for a cancelled job. Called only by the two cancel paths.
create or replace function public._settle_cancellation(p_job uuid, p_reason text, p_fee_applies boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary record;
  v_has_primary boolean := false;
  v_other record;
  v_fee integer;
  v_fee_minor bigint;
begin
  select * into v_primary from public.payments
   where job_id = p_job and purpose = 'job' and status = 'held'
   order by created_at, id
   limit 1
   for update;
  v_has_primary := found;

  -- amount_dop includes the tip (amountDop = chargedDop + tipDop). The fee comes from the charged part only.
  -- The tip is never kept: the refund is amount_dop - fee, so the tip returns whole.
  v_fee := case when v_has_primary and p_fee_applies
                then least(300, coalesce(v_primary.amount_dop, 0) - coalesce(v_primary.tip_dop, 0))
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
    end if;
  elsif v_has_primary then
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
    values (v_primary.id, p_job, v_primary.amount_dop, v_primary.amount_minor, p_reason);
  end if;

  -- Every other held job or diagnostic payment refunds in full.
  for v_other in
    select * from public.payments
     where job_id = p_job and purpose in ('job', 'diagnostic') and status = 'held'
       and (not v_has_primary or id <> v_primary.id)
  loop
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
    values (v_other.id, p_job, v_other.amount_dop, v_other.amount_minor, p_reason);
  end loop;
end;
$$;

-- 5. Client and pro cancel. Same statuses and strike as 0077. Adds the fee rule and an idempotent repeat.
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

  perform public._settle_cancellation(j.id, v_reason, v_fee_applies);

  select count(*) into v_refunds from public.refunds where job_id = j.id and status = 'pending';
  if v_refunds = 0 then return 'cancelled'; end if;
  return 'refund_pending';
end;
$function$;

-- 6. Client no-show, reported by the pro after arrival. Same grace rule as a late cancel.
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
  perform public._settle_cancellation(j.id, 'client_no_show', v_fee_applies);

  if exists (select 1 from public.refunds where job_id = j.id and status = 'pending') then
    return 'refund_pending';
  end if;
  return 'cancelled';
end;
$$;

-- 7. Dispute on the fee. Only the client, only while the primary's fee is held and inside its 48-hour window.
create or replace function public.open_dispute(p_job uuid, p_latent boolean default false, p_reason text default null)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  j record;
  p record;
  uid uuid := (select auth.uid());
  v_side text;
  v_phase text;
  v_dispute_id uuid;
  v_other uuid;
begin
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Describe el problema (mínimo 10 caracteres).';
  end if;

  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  if uid is null or (j.homeowner_id is distinct from uid and j.pro_id is distinct from uid) then
    raise exception 'Solo las partes del trabajo pueden abrir una disputa.';
  end if;
  v_side := case when j.homeowner_id = uid then 'homeowner' else 'pro' end;

  -- Cancelled job: the only dispute is the client contesting the cancellation fee.
  if j.status = 'cancelled' then
    if v_side <> 'homeowner' then
      raise exception 'Solo el cliente puede disputar la tarifa de cancelación.' using errcode = '22023';
    end if;
    select * into p from public.payments
     where job_id = j.id and purpose = 'job' and status = 'held'
       and keep_dop is not null and cancel_fee_release_after > now()
     order by created_at, id
     limit 1
     for update;
    if not found then raise exception 'La tarifa de cancelación ya no se puede disputar.' using errcode = '22023'; end if;

    insert into public.disputes (
      job_id, payment_id, opened_by, opened_side, phase, latent_defect, reason,
      stage, notified_at, evidence_due_at, reminder_due_at, fee_dispute
    ) values (
      j.id, p.id, uid, 'homeowner', 'pre_release', false, trim(p_reason),
      'evidence', now(), now() + interval '48 hours', now() + interval '24 hours', true
    )
    returning id into v_dispute_id;

    if j.pro_id is not null then
      insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
      values (v_dispute_id, j.pro_id, 'notice',
        'El cliente disputa la tarifa de cancelación de este trabajo. Tienes 48 horas para enviar tu versión.');
    end if;

    update public.payments set status = 'disputed' where id = p.id;
    return 'open';
  end if;

  if j.status <> 'completed' or j.approved_at is null then
    raise exception 'La disputa solo aplica a trabajos terminados.';
  end if;
  if now() > j.approved_at + interval '48 hours' then
    raise exception 'El plazo de 48 horas para disputar venció.';
  end if;

  select * into p from public.payments
   where job_id = j.id and purpose = 'job' and status in ('held', 'released', 'disputed')
   limit 1;
  if not found then raise exception 'No hay pago que disputar.'; end if;
  if p.status = 'disputed' then raise exception 'Ya hay una disputa abierta para este trabajo.'; end if;

  if p.status = 'held' then
    v_phase := 'pre_release';
    if now() >= p.release_after and not coalesce(p_latent, false) then
      raise exception 'Después de 24 horas solo se acepta un defecto latente.';
    end if;
  else
    if not coalesce(p_latent, false) then
      raise exception 'Después de la liberación solo se acepta un defecto latente.';
    end if;
    v_phase := 'post_release';
  end if;

  insert into public.disputes (
    job_id, payment_id, opened_by, opened_side, phase, latent_defect, reason,
    stage, notified_at, evidence_due_at, reminder_due_at
  ) values (
    j.id, p.id, uid, v_side, v_phase, coalesce(p_latent, false), trim(p_reason),
    'evidence', now(), now() + interval '48 hours', now() + interval '24 hours'
  )
  returning id into v_dispute_id;

  v_other := case when v_side = 'homeowner' then j.pro_id else j.homeowner_id end;
  if v_other is not null then
    insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
    values (v_dispute_id, v_other, 'notice',
      'Se abrió una disputa sobre tu trabajo. Tienes 48 horas para enviar tu versión y fotos.');
  end if;

  if v_phase = 'pre_release' then
    update public.payments set status = 'disputed' where id = p.id;
  end if;
  return 'open';
end;
$function$;

-- 8. Admin decision on a fee dispute. Admin only (is_admin, AAL2). Separate from resolve_dispute.
create or replace function public.resolve_fee_dispute(p_dispute uuid, p_outcome text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  p record;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Solo el administrador puede resolver una disputa.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe la razón de la decisión (mínimo 10 caracteres).' using errcode = '22023';
  end if;

  select * into d from public.disputes where id = p_dispute for update;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if not d.fee_dispute then raise exception 'Esta disputa no es de tarifa de cancelación.'; end if;
  if d.status <> 'open' or d.stage <> 'evidence' then raise exception 'La disputa ya fue decidida.'; end if;
  if now() < d.evidence_due_at then raise exception 'La ventana de evidencia aún no vence.'; end if;

  select * into p from public.payments where id = d.payment_id for update;
  if p.status <> 'disputed' then raise exception 'El pago no está congelado.'; end if;

  if p_outcome = 'fee_uphold' then
    -- Fee stays with the pro. Release follows the claim_due_payments fee branch.
    update public.payments set status = 'held' where id = p.id;
    update public.disputes
       set status = 'resolved_pro', stage = 'closed', outcome = p_outcome,
           decided_at = now(), decided_by = (select auth.uid()), decision_reason = trim(p_reason), resolved_at = now()
     where id = d.id;
    return 'fee_uphold';
  elsif p_outcome = 'fee_reverse' then
    if p.keep_dop is null or p.keep_minor is null or p.keep_dop <= 0 then
      raise exception 'No hay tarifa que revertir.';
    end if;
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
    values (p.id, p.job_id, p.keep_dop, p.keep_minor, 'fee_reversed', d.id);
    -- The fee is no longer the pro's. Status stays 'disputed' until the refund succeeds.
    update public.payments
       set keep_dop = null, keep_minor = null, keep_pro_payout_dop = null,
           keep_commission_dop = null, cancel_fee_release_after = null
     where id = p.id;
    update public.disputes
       set status = 'resolved_homeowner', stage = 'closed', outcome = p_outcome,
           decided_at = now(), decided_by = (select auth.uid()), decision_reason = trim(p_reason), resolved_at = now()
     where id = d.id;
    return 'fee_reverse';
  end if;
  raise exception 'Resultado no válido.';
end;
$$;

-- 9. Refund success. The fee refund leaves the payment held. A fee reversal refunds the payment.
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

-- 10. Release. A cancelled job releases only its kept fee, after the 48-hour window, when no dispute froze it.
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
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop) as gross,
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

-- 11. Grants.
revoke all on function public._settle_cancellation(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.pro_mark_arrived(uuid) from public, anon;
grant execute on function public.pro_mark_arrived(uuid) to authenticated;
revoke all on function public.pro_report_client_no_show(uuid) from public, anon;
grant execute on function public.pro_report_client_no_show(uuid) to authenticated;
revoke all on function public.resolve_fee_dispute(uuid, text, text) from public, anon;
grant execute on function public.resolve_fee_dispute(uuid, text, text) to authenticated;
revoke all on function public.cancel_job_with_refund(uuid, text) from public, anon;
grant execute on function public.cancel_job_with_refund(uuid, text) to authenticated, service_role;
revoke all on function public.claim_due_payments(integer) from public, anon, authenticated;
grant execute on function public.claim_due_payments(integer) to service_role;
revoke all on function public.mark_refund_succeeded(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refund_succeeded(uuid, text) to service_role;
