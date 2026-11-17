-- 0078 approve_quote: persist the expired status.
-- STATUS: APPLIED to production on 2026-11-16 after Sam's sign-off. Do not re-apply.
--
-- Bug: the expired branch set the quote to 'expired' and then raised. The raise rolled back
-- the update, so the quote stayed 'sent' until the hourly expire-quotes job ran.
--
-- Fix: the expired branch saves the status and returns NULL (no exception).
-- approveQuote in src/lib/data/jobs.ts turns NULL into the Spanish error, so the caller still
-- sees "La cotización venció. Pide una nueva al profesional."
-- Every other path is unchanged, including the 0077 job-status guard.

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

  select * into j from public.jobs where id = q.job_id for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  if j.status not in ('requested', 'quoted') then
    raise exception 'Este trabajo ya no se puede aprobar.';
  end if;

  if q.status <> 'sent' then raise exception 'Esta cotización no se puede aprobar.'; end if;
  if q.valid_until <= now() then
    -- Persist the expiry. Returning (not raising) keeps this update from being rolled back.
    update public.quotes set status = 'expired' where id = q.id;
    return null;
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
