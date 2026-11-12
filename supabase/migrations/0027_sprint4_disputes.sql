-- Sprint 4: disputes and mediation (spec D1, D4, D6). Extends the Sprint 3 dispute engine.
-- Rules applied:
--   * Evidence window: 48h from the moment the other side is notified; one reminder at 24h.
--   * No default win, no extensions, no early decision: the admin decides only after the window closes.
--   * Stages: filed -> evidence -> decided -> executed -> closed. Closed is final.
--   * Redo: the dispute stays "decided" until the redo close-out is approved (finish_redo_dispute).
--   * Partial refund commission: tier on the ORIGINAL job amount, applied to the kept portion;
--     RD$400 minimum on the kept portion (repair, free plan); RD$15,000 cap on repair commission.
--   * Notifications are in-app rows in dispute_notifications. Email/WhatsApp delivery comes later.

-- 1. Stages and timestamps on disputes ---------------------------------------
alter table public.disputes
  add column if not exists stage text,
  add column if not exists notified_at timestamptz,
  add column if not exists evidence_due_at timestamptz,
  add column if not exists reminder_due_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references public.profiles(id),
  add column if not exists decision_reason text,
  add column if not exists closed_at timestamptz;

update public.disputes
   set stage = case when status = 'open' then 'filed' else 'closed' end
 where stage is null;

alter table public.disputes alter column stage set not null;
alter table public.disputes add constraint disputes_stage_check
  check (stage in ('filed', 'evidence', 'decided', 'executed', 'closed'));

-- 2. Notifications (in-app for v1) and evidence ------------------------------
create table if not exists public.dispute_notifications (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references public.disputes(id),
  recipient_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('notice', 'reminder', 'decision', 'recovery_request')),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.dispute_notifications enable row level security;
create policy dispute_notifications_own on public.dispute_notifications
  for select using (recipient_id = (select auth.uid()));

create table if not exists public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id),
  author_id uuid not null references public.profiles(id),
  side text not null check (side in ('homeowner', 'pro')),
  statement text not null check (length(trim(statement)) >= 10),
  created_at timestamptz not null default now(),
  unique (dispute_id, author_id)
);
alter table public.dispute_evidence enable row level security;
create policy dispute_evidence_read on public.dispute_evidence
  for select using (
    public.is_admin()
    or exists (select 1 from public.disputes d where d.id = dispute_id and public.is_job_party(d.job_id))
  );

-- 3. Opening a dispute starts the evidence window --------------------------------
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

-- Either party may send one statement while the window is open.
create or replace function public.submit_dispute_evidence(p_dispute uuid, p_statement text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d record;
  uid uuid := (select auth.uid());
  v_side text;
begin
  select * into d from public.disputes where id = p_dispute;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if d.stage <> 'evidence' then raise exception 'La ventana de evidencia está cerrada.'; end if;
  if now() >= d.evidence_due_at then raise exception 'La ventana de evidencia venció.'; end if;

  select case when j.homeowner_id = uid then 'homeowner' when j.pro_id = uid then 'pro' end
    into v_side
    from public.jobs j where j.id = d.job_id;
  if v_side is null then raise exception 'Solo las partes pueden enviar evidencia.'; end if;

  insert into public.dispute_evidence (dispute_id, author_id, side, statement)
  values (p_dispute, uid, v_side, trim(p_statement));
end;
$function$;

-- 4. Admin decision: evidence window must have closed; money rules as in Sprint 3,
--    with the approved partial-refund commission rule. Replaces the Sprint 3 signature.
drop function if exists public.resolve_dispute(uuid, text, integer);

create or replace function public.resolve_dispute(
  p_dispute uuid, p_outcome text, p_refund_dop integer default null, p_reason text default null
)
returns text
language plpgsql
security definer
set search_path to ''
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
  v_kept_comm integer;
  v_kept_payout integer;
  v_balance bigint;
  v_other uuid;
begin
  if not public.is_admin() then
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
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;

      -- Tier on the ORIGINAL job amount (approved rule), applied to the kept portion.
      v_rate := case
        when j.job_type = 'diagnostic' then 15
        when v_plan = 'pro' then 8
        when p.amount_dop < 5000 then 15
        when p.amount_dop <= 25000 then 12
        else 10
      end;
      v_kept_comm := floor((v_kept_dop * v_rate * 2 + 100) / 200);  -- half up to the peso
      if j.job_type = 'repair' and v_plan <> 'pro' and v_kept_comm < 400 then
        v_kept_comm := 400;                                           -- RD$400 minimum on the kept portion
      end if;
      if j.job_type = 'repair' and v_kept_comm > 15000 then
        v_kept_comm := 15000;                                         -- RD$15,000 cap
      end if;
      v_kept_comm := least(v_kept_comm, v_kept_dop);                  -- commission never exceeds the kept amount
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

  -- Decision notices, plain Spanish, to both parties.
  update public.disputes
     set decided_at = now(),
         decided_by = (select auth.uid()),
         decision_reason = trim(p_reason),
         outcome = p_outcome,
         refund_dop = v_refund_dop,
         stage = case when p_outcome = 'redo' then 'decided' else 'executed' end
   where id = d.id;

  if p_outcome = 'redo' then
    update public.disputes set status = 'open' where id = d.id;   -- stays open until the redo is approved
    return 'redo_pending';
  end if;

  update public.disputes
     set status = case when p_outcome = 'release_full' then 'resolved_pro' else 'resolved_homeowner' end,
         resolved_at = now()
   where id = d.id;

  v_other := null;
  insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
  select d.id, x, 'decision', 'La disputa fue decidida. Motivo: ' || trim(p_reason) || ' Esta decisión es final en la plataforma.'
    from unnest(array[j.homeowner_id, j.pro_id]) as x
   where x is not null;

  return 'resolved';
end;
$function$;

revoke all on function public.resolve_dispute(uuid, text, integer, text) from public;
grant execute on function public.resolve_dispute(uuid, text, integer, text) to authenticated;
revoke all on function public.submit_dispute_evidence(uuid, text) from public;
grant execute on function public.submit_dispute_evidence(uuid, text) to authenticated;

-- 5. Admin: finish a redo once the redo close-out is approved; close a dispute.
create or replace function public.finish_redo_dispute(p_dispute uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede cerrar un rediseño.'; end if;
  update public.disputes
     set stage = 'executed', status = 'resolved_pro', resolved_at = now()
   where id = p_dispute and outcome = 'redo' and stage = 'decided' and status = 'open';
  if not found then raise exception 'La disputa no está esperando un rediseño.'; end if;
end;
$function$;

create or replace function public.close_dispute(p_dispute uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede cerrar una disputa.'; end if;
  update public.disputes
     set stage = 'closed', closed_at = now()
   where id = p_dispute and stage = 'executed';
  if not found then raise exception 'La disputa todavía no está ejecutada.'; end if;
end;
$function$;

revoke all on function public.finish_redo_dispute(uuid) from public;
grant execute on function public.finish_redo_dispute(uuid) to authenticated;
revoke all on function public.close_dispute(uuid) from public;
grant execute on function public.close_dispute(uuid) to authenticated;

-- 6. Scheduled checks ------------------------------------------------------------
-- One reminder per dispute at 24h, to the side that has not filed.
create or replace function public.run_dispute_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  v_count integer := 0;
  v_recipient uuid;
begin
  for r in
    select d.id, d.opened_side, j.homeowner_id, j.pro_id
      from public.disputes d
      join public.jobs j on j.id = d.job_id
     where d.stage = 'evidence' and d.reminder_due_at <= now() and d.reminder_sent_at is null
  loop
    v_recipient := case when r.opened_side = 'homeowner' then r.pro_id else r.homeowner_id end;
    update public.disputes set reminder_sent_at = now() where id = r.id;
    if v_recipient is not null then
      insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
      values (r.id, v_recipient, 'reminder',
        'Recordatorio: quedan 24 horas para enviar tu versión de la disputa.');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

-- Written payment request after 30 days owed; suspension on a later run if still unsettled.
alter table public.pro_recoveries add column if not exists request_sent_at timestamptz;
alter table public.pros add column if not exists suspended_at timestamptz;

create or replace function public.run_recovery_checks()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_count integer := 0;
begin
  -- One written request per recovery, once it has been owed for 30 days.
  for rec in
    select id, pro_id from public.pro_recoveries
     where status = 'owed' and request_sent_at is null and created_at <= now() - interval '30 days'
  loop
    update public.pro_recoveries set request_sent_at = now() where id = rec.id;
    insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
    values (null, rec.pro_id, 'recovery_request',
      'Tienes un pago pendiente a la plataforma por una devolución al cliente. Págalo para evitar la suspensión de tu cuenta.');
    v_count := v_count + 1;
  end loop;

  -- Suspend pros whose written request was sent on an earlier run and is still unsettled.
  update public.pros p
     set suspended_at = now()
   where p.suspended_at is null
     and exists (
       select 1 from public.pro_recoveries pr
        where pr.pro_id = p.id and pr.status = 'owed'
          and pr.request_sent_at is not null and pr.request_sent_at < now()
     );
  return v_count;
end;
$function$;

-- Clear suspension when the last owed recovery is settled.
create or replace function public.clear_suspension_when_settled()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.status = 'settled' and old.status <> 'settled' then
    if not exists (select 1 from public.pro_recoveries r where r.pro_id = new.pro_id and r.status = 'owed') then
      update public.pros set suspended_at = null where id = new.pro_id;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists pro_recoveries_clear_suspension on public.pro_recoveries;
create trigger pro_recoveries_clear_suspension
  after update of status on public.pro_recoveries
  for each row execute function public.clear_suspension_when_settled();

revoke all on function public.run_dispute_reminders() from public;
revoke all on function public.run_recovery_checks() from public;
