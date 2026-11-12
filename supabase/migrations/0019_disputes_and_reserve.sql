-- Disputes and guarantee reserve (Sprint 3, slice 2).
-- Source: LISTAVY D1/D4 spec, 2026-11-11, sections 1-5 and 7.
--
-- Built:
--   * Dispute filing within 48 h of approval. Pre-release filing freezes the payment ('disputed').
--   * Pre-release outcomes: release_full, full_refund, partial_refund (admin amount), redo (freeze kept).
--   * Partial split: commission on the kept portion only, at the original effective rate.
--   * Post-release (latent defect only): refund from the guarantee reserve, capped at the job amount.
--   * Ledger for the reserve and recovery records against the pro.
--
-- Not built (the spec does not decide these; see the report):
--   * Reserve funding rule. record_reserve_funding takes an admin-entered amount.
--   * Recovery netting from future payouts, the 30-day rule, the written request, suspension.
--   * Redo close-out that releases the frozen payment.
--   * Mediation UI and evidence window (Sprint 4).

-- 1. Kept split on payments after a partial pre-release decision. Null means the whole payment is kept.
alter table public.payments
  add column if not exists keep_dop integer check (keep_dop is null or keep_dop > 0),
  add column if not exists keep_minor bigint check (keep_minor is null or keep_minor > 0),
  add column if not exists keep_pro_payout_dop integer check (keep_pro_payout_dop is null or keep_pro_payout_dop >= 0),
  add column if not exists keep_commission_dop integer check (keep_commission_dop is null or keep_commission_dop >= 0);

alter table public.payments
  add constraint payments_keep_split_consistent
  check (keep_dop is null or keep_pro_payout_dop + keep_commission_dop = keep_dop);

-- 2. Disputes. Migration 0001 created this table, and 0010/0012 read it for account deletion.
-- Extend it in place. Legacy status values stay valid. Production had no rows when this was written.
alter table public.disputes
  add column if not exists payment_id uuid references public.payments(id),
  add column if not exists opened_side text check (opened_side in ('homeowner', 'pro')),
  add column if not exists phase text check (phase in ('pre_release', 'post_release')),
  add column if not exists latent_defect boolean not null default false,
  add column if not exists outcome text check (outcome in ('release_full', 'partial_refund', 'full_refund', 'redo')),
  add column if not exists refund_dop integer check (refund_dop is null or refund_dop > 0),
  add column if not exists opened_at timestamptz not null default now();

create unique index if not exists disputes_one_open_per_job
  on public.disputes (job_id) where status = 'open';

-- 3. Guarantee reserve ledger. Funding adds, draws subtract. Service role only.
create table if not exists public.guarantee_reserve (
  id uuid primary key default gen_random_uuid(),
  entry_kind text not null check (entry_kind in ('funding', 'draw')),
  amount_dop integer not null check (amount_dop > 0),
  dispute_id uuid references public.disputes(id),
  created_at timestamptz not null default now(),
  check (entry_kind = 'funding' or dispute_id is not null)
);

-- 4. Recovery owed by a pro after a guarantee refund. Netting from payouts is not built.
create table if not exists public.pro_recoveries (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pros(id),
  dispute_id uuid not null unique references public.disputes(id),
  amount_dop integer not null check (amount_dop > 0),
  status text not null default 'owed' check (status in ('owed', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- 5. Refunds: new reasons and a link to the dispute.
alter table public.refunds add column if not exists dispute_id uuid references public.disputes(id);
alter table public.refunds drop constraint refunds_reason_check;
alter table public.refunds add constraint refunds_reason_check
  check (reason in ('client_cancel_pre_work', 'pro_cancel', 'dispute_full', 'dispute_partial', 'guarantee_refund'));

alter table public.disputes enable row level security;
drop policy if exists disputes_insert_party on public.disputes;
drop policy if exists disputes_update_admin on public.disputes;
revoke insert, update, delete on public.disputes from public, anon, authenticated;
alter table public.guarantee_reserve enable row level security;
alter table public.pro_recoveries enable row level security;
revoke all on public.guarantee_reserve from public, anon, authenticated;
revoke all on public.pro_recoveries from public, anon, authenticated;

-- 6. Claims skip disputed payments (status is not 'held'). A partial split pays the kept portion.
create or replace function public.claim_due_payments(p_limit integer default 20)
returns table (
  payment_id uuid,
  job_id uuid,
  payment_intent_id text,
  amount_minor bigint,
  amount_dop integer,
  pro_payout_dop integer,
  pro_account_id text
)
language sql
set search_path to ''
as $$
  select p.id, p.job_id, p.stripe_payment_intent_id,
         coalesce(p.keep_minor, p.amount_minor),
         coalesce(p.keep_dop, p.amount_dop),
         coalesce(p.keep_pro_payout_dop, p.pro_payout_dop),
         pr.stripe_account_id
    from public.payments p
    join public.jobs j on j.id = p.job_id
    join public.pros pr on pr.id = j.pro_id
   where p.status = 'held'
     and p.release_after <= now()
     and j.status = 'completed'
   order by p.release_after
   limit greatest(1, least(p_limit, 50))
     for update of p skip locked;
$$;

-- 7. Refund results. Each reason moves the payment differently.
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
    -- The kept portion goes back to held and is released by the normal schedule.
    update public.payments
       set status = 'held', refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id;
  elsif r.reason = 'guarantee_refund' then
    -- Paid from the reserve. The payment stays released; the reserve ledger records the draw.
    update public.payments
       set refunded_minor = refunded_minor + r.amount_minor
     where id = r.payment_id
     returning * into pm;
    insert into public.guarantee_reserve (entry_kind, amount_dop, dispute_id)
    values ('draw', r.amount_dop, r.dispute_id);
    if pm.refunded_minor >= pm.amount_minor then
      update public.jobs set payment_status = 'refunded' where id = r.job_id;
    end if;
  else
    -- Cancellations and full refunds before release.
    update public.payments
       set status = 'refunded', refunded_minor = r.amount_minor
     where id = r.payment_id;
    update public.jobs set payment_status = 'refunded' where id = r.job_id;
  end if;
  return 'succeeded';
end;
$$;

-- 8. Filing. Either party of the job, within 48 h of approval. The reason is required.
-- Pre-release (payment still held): freezes the payment. After the 24 h release point, a latent defect is required.
-- Post-release (payment released): latent defect only.
drop function if exists public.open_dispute(uuid, boolean);
create or replace function public.open_dispute(p_job uuid, p_latent boolean default false, p_reason text default null)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  j record;
  p record;
  uid uuid := (select auth.uid());
  v_side text;
  v_phase text;
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

  insert into public.disputes (job_id, payment_id, opened_by, opened_side, phase, latent_defect, reason)
  values (j.id, p.id, uid, v_side, v_phase, coalesce(p_latent, false), trim(p_reason));

  if v_phase = 'pre_release' then
    update public.payments set status = 'disputed' where id = p.id;
  end if;
  return 'open';
end;
$$;

-- 9. Admin decision. Service role only. Sprint 4 admin desk will call this.
create or replace function public.resolve_dispute(p_dispute uuid, p_outcome text, p_refund_dop integer default null)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  d record;
  p record;
  v_pro uuid;
  v_refund_dop integer;
  v_refund_minor bigint;
  v_kept_dop integer;
  v_kept_minor bigint;
  v_kept_comm integer;
  v_kept_payout integer;
  v_balance bigint;
begin
  select * into d from public.disputes where id = p_dispute for update;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if d.status <> 'open' then raise exception 'La disputa ya fue resuelta.'; end if;

  select * into p from public.payments where id = d.payment_id for update;
  select pro_id into v_pro from public.jobs where id = d.job_id;

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
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;
      v_kept_comm := round(p.commission_dop::numeric * v_kept_dop / p.amount_dop)::integer;
      v_kept_payout := v_kept_dop - v_kept_comm;
      update public.payments
         set keep_dop = v_kept_dop,
             keep_minor = v_kept_minor,
             keep_pro_payout_dop = v_kept_payout,
             keep_commission_dop = v_kept_comm
       where id = p.id;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'dispute_partial', d.id);

    elsif p_outcome = 'redo' then
      -- No money moves. The payment stays disputed until the redo is approved (not built here).
      null;

    else
      raise exception 'Resultado no válido.';
    end if;

  else
    -- Post-release: guarantee refund only, capped at the job amount.
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

  if p_outcome = 'redo' then
    -- The dispute stays open until the redo is approved (redo close-out is not built).
    update public.disputes set outcome = 'redo' where id = d.id;
    return 'redo_pending';
  end if;

  update public.disputes
     set status = case when p_outcome = 'release_full' then 'resolved_pro' else 'resolved_homeowner' end,
         outcome = p_outcome,
         refund_dop = v_refund_dop,
         resolved_at = now()
   where id = d.id;
  return 'resolved';
end;
$$;

-- 10. Reserve funding. The spec names operating margin as the source but gives no amount or rule.
-- Service role only; the amount is entered by an admin.
create or replace function public.record_reserve_funding(p_amount_dop integer)
returns text
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.guarantee_reserve (entry_kind, amount_dop) values ('funding', p_amount_dop);
  return 'funded';
end;
$$;

revoke execute on function public.open_dispute(uuid, boolean, text) from public, anon;
grant execute on function public.open_dispute(uuid, boolean, text) to authenticated, service_role;
revoke execute on function public.resolve_dispute(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.resolve_dispute(uuid, text, integer) to service_role;
revoke execute on function public.record_reserve_funding(integer) from public, anon, authenticated;
grant execute on function public.record_reserve_funding(integer) to service_role;
revoke execute on function public.mark_refund_succeeded(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refund_succeeded(uuid, text) to service_role;
