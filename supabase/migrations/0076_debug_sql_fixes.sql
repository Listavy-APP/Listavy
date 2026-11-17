-- 0076 Debug pass SQL fixes (security and money-path corrections).
-- STATUS: APPLIED to production on 2026-11-16 after Sam's sign-off. Do not re-apply.
--
-- 1. Revoke public execute on run_recovery_checks and run_dispute_reminders.
--    Both are SECURITY DEFINER and do not check the caller. pg_cron jobs run as
--    the postgres role (verified: cron.job.username = 'postgres'), which keeps execute.
-- 2. cancel_job_with_refund: include purpose = 'diagnostic' held payments. Refund is full,
--    no fee, per the cancellation policy. Loops over every held job or diagnostic payment.
-- 3. expire_quotes schedule: production-only pg_cron step, documented at the end of this file.
--    NOT executed by this migration.
-- 4. is_client_suspended: caller must be the account in question, or an admin.
-- 5. admin_notification_summary: total includes pending photo reports and pending verifications.
--    Return columns are unchanged (CREATE OR REPLACE keeps the signature).
--
-- Not changed here: any RLS policy, storage policy, RPC grant other than the ones listed.

-- ============================================================================
-- 1. Revoke public execute on the two cron-only functions.
-- ============================================================================
revoke execute on function public.run_recovery_checks() from public, anon, authenticated;
revoke execute on function public.run_dispute_reminders() from public, anon, authenticated;

-- ============================================================================
-- 2. cancel_job_with_refund: include diagnostic payments.
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

  -- Full refund of every held job or diagnostic payment on this job (no fee).
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
-- 4. is_client_suspended: self or admin only.
-- ============================================================================
create or replace function public.is_client_suspended(p_client uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_client is distinct from (select auth.uid()) and not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return exists (select 1 from public.client_suspensions where client_id = p_client);
end;
$function$;

revoke execute on function public.is_client_suspended(uuid) from public, anon;
grant execute on function public.is_client_suspended(uuid) to authenticated;

-- ============================================================================
-- 5. admin_notification_summary: bell total includes photo reports and verifications.
-- ============================================================================
create or replace function public.admin_notification_summary()
returns table(open_disputes bigint, open_pro_reports bigint, reviews_awaiting_moderation bigint,
              unresolved_job_flags bigint, pending_pro_applications bigint, total bigint, severity text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_disputes bigint;
  v_reports bigint;
  v_reviews bigint;
  v_flags bigint;
  v_pros bigint;
  v_photos bigint;
  v_verifications bigint;
  v_total bigint;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;

  select count(*) into v_disputes from public.disputes where status = 'open';
  select count(*) into v_reports from public.pro_reports where resolved_at is null;
  select count(*) into v_reviews from public.reviews where status = 'hidden';
  select count(*) into v_flags from public.job_notifications
    where problem_reported_at is not null and problem_resolved_at is null;
  select count(*) into v_pros from public.pros where verification_status = 'pending';
  select count(*) into v_photos from public.job_photo_reports where status = 'pending';
  select count(*) into v_verifications from public.pro_verifications where status = 'pending';

  v_total := v_disputes + v_reports + v_reviews + v_flags + v_pros + v_photos + v_verifications;

  return query select
    v_disputes, v_reports, v_reviews, v_flags, v_pros, v_total,
    case when v_disputes > 0 or v_reports > 0 then 'urgent'
         when v_total > 0 then 'attention'
         else 'clear' end;
end;
$function$;

-- ============================================================================
-- PRODUCTION-ONLY STEP (not run by this migration). pg_cron lives in production, not in migrations.
-- Proposed after Sam review. Runs hourly at :05 as postgres, same as the other jobs.
--
--   select cron.schedule('expire-quotes', '5 * * * *', $$select public.expire_quotes()$$);
--
-- Verify after scheduling:
--   select jobname, schedule, active from cron.job where jobname = 'expire-quotes';
--   select jobname, status, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'expire-quotes')
--    order by start_time desc limit 3;
-- ============================================================================
