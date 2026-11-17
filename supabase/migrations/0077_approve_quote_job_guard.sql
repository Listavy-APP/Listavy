-- 0077 Approve-quote job guard and quote withdrawal on pro cancel.
-- STATUS: DRAFT. NOT APPLIED. Sam must review before apply_migration.
--
-- Bug: approve_quote never checked the job status. A pro who cancelled from requested/quoted
-- via cancel_job_with_refund left a 'sent' quote behind. The client could approve it and
-- approve_quote set the cancelled job back to 'accepted' and reassigned the pro who cancelled.
--
-- 1. approve_quote: lock the job and require status requested or quoted.
-- 2. cancel_job_with_refund: withdraw invited/sent quotes when the job is cancelled.
--    Refund logic, strike rule and state checks are unchanged from 0076.

-- ============================================================================
-- 1. approve_quote: job-status guard.
-- Body is the production definition with one block added after the homeowner check.
-- ============================================================================
create or replace function public.approve_quote(p_quote uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  q record;
  j record;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.revision_of is not null then raise exception 'Este cambio se aprueba con aprobar_cambio.'; end if;
  if not public.is_job_homeowner(q.job_id) then raise exception 'Solo quien pidió el trabajo puede aprobarla.'; end if;

  -- Job guard: a cancelled (or otherwise closed) job must not be revived by approving a leftover quote.
  select * into j from public.jobs where id = q.job_id for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  if j.status not in ('requested', 'quoted') then
    raise exception 'Este trabajo ya no se puede aprobar.';
  end if;

  if q.status <> 'sent' then raise exception 'Esta cotización no se puede aprobar.'; end if;
  if q.valid_until <= now() then
    update public.quotes set status = 'expired' where id = q.id;
    raise exception 'La cotización venció. Pide una nueva al profesional.';
  end if;

  update public.quotes set status = 'accepted' where id = q.id;
  update public.quotes set status = 'rejected'
   where job_id = q.job_id and id <> q.id and revision_of is null and status in ('invited', 'sent');

  update public.jobs set
    pro_id = q.pro_id,
    status = 'accepted',
    approved_quote_id = q.id,
    booked_at = now()
  where id = q.job_id;

  return q.job_id;
end;
$function$;

-- ============================================================================
-- 2. cancel_job_with_refund: withdraw quotes on cancel.
-- Body is the 0076 definition with one update added after the job is cancelled.
-- ============================================================================
create or replace function public.cancel_job_with_refund(p_job uuid, p_by text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  j record;
  p record;
  uid uuid := (select auth.uid());
  v_reason text;
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

  if j.status not in ('requested', 'quoted', 'accepted') then
    raise exception 'El trabajo no se puede cancelar en este estado.';
  end if;

  if p_by = 'pro' then
    insert into public.pro_strikes (pro_id, job_id, reason) values (j.pro_id, j.id, 'pro_cancel');
  end if;

  update public.jobs set status = 'cancelled' where id = j.id;

  -- New in 0077: withdraw open quotes so none remain approvable on a cancelled job.
  update public.quotes set status = 'withdrawn'
   where job_id = j.id and status in ('invited', 'sent');

  -- Full refund of every held job or diagnostic payment on this job (no fee). Unchanged from 0076.
  for p in
    select * from public.payments
     where job_id = j.id and purpose in ('job', 'diagnostic') and status = 'held'
  loop
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
    values (p.id, j.id, p.amount_dop, p.amount_minor, v_reason);
    v_refunds := v_refunds + 1;
  end loop;

  if v_refunds = 0 then
    return 'cancelled';
  end if;
  return 'refund_pending';
end;
$function$;

-- ============================================================================
-- Pre-apply read (run manually, not in migration): dangling sent quotes on cancelled jobs.
--   select q.id, q.job_id, q.status, j.status from public.quotes q join public.jobs j on j.id = q.job_id
--    where j.status = 'cancelled' and q.status in ('invited', 'sent');
-- Rows found here were left behind by earlier pro cancels. The guard in part 1 already blocks approving them.
-- Withdrawing them is a data change and is NOT in this migration.
-- ============================================================================
