-- Listavy · 0012 · Revised quotes (plan 1.5) and job files in account deletion (C5, §2.1).
--
-- Revised quote rules:
--   * Only the assigned pro proposes, only while the job is in_progress, only for repair jobs.
--   * One pending revision per job. A revision is a new quotes row with revision_of = the current approved quote.
--   * Revision is valid 48h from proposal (same as a quote). Homeowner approves it in the app. No verbal changes.
--   * Approval: the revision becomes the approved quote, the old quote becomes 'superseded' (kept for the record),
--     and jobs.pending_difference_dop = revision amount - original paid quote amount (signed: negative = refund).
--   * The difference is charged or refunded in Sprint 3 (Stripe). This migration only records it. payment_status is unchanged.
--
-- Deletion: anonymise_customer also returns the customer's request photos and voice note, and removes those rows.
--   Pro before/after photos stay (needed for dispute and chargeback evidence, plan 1.4 / 2.3). Retention to be confirmed by counsel.

-- ---------------------------------------------------------------------------
-- 1. Revised quotes
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column revision_of uuid references public.quotes (id),
  add column revision_reason text;

alter table public.quotes drop constraint quotes_job_id_pro_id_key;
create unique index quotes_one_original_per_pro
  on public.quotes (job_id, pro_id) where revision_of is null;

alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check
    check (status in ('invited', 'declined', 'sent', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded'));

alter table public.jobs add column pending_difference_dop integer not null default 0;

-- The original quote cannot be approved through the revision path, and a revision cannot use approve_quote.
create or replace function public.approve_quote(p_quote uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.revision_of is not null then raise exception 'Este cambio se aprueba con aprobar_cambio.'; end if;
  if not public.is_job_homeowner(q.job_id) then raise exception 'Solo quien pidió el trabajo puede aprobarla.'; end if;
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
$$;

-- Pro proposes a revision on an in-progress repair job.
create or replace function public.propose_revision(
  p_job uuid,
  p_amount_dop integer,
  p_includes text,
  p_excludes text,
  p_materials_included boolean,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_duration_hours numeric,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  j record;
  v_new uuid;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found or j.pro_id is distinct from (select auth.uid()) then raise exception 'Solo el profesional asignado puede proponer un cambio.'; end if;
  if j.status <> 'in_progress' then raise exception 'Solo puedes cambiar el precio mientras el trabajo está en curso.'; end if;
  if j.job_type <> 'repair' then raise exception 'La visita de diagnóstico no admite cambios de precio.'; end if;
  if j.approved_quote_id is null then raise exception 'No hay cotización aprobada para cambiar.'; end if;
  if exists (select 1 from public.quotes where job_id = p_job and revision_of is not null and status = 'sent' and valid_until > now()) then
    raise exception 'Ya hay un cambio pendiente de aprobación.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Explica el motivo del cambio con al menos 10 caracteres.'; end if;
  if p_amount_dop is null or p_amount_dop <= 0 then raise exception 'Escribe un precio válido.'; end if;
  if char_length(btrim(coalesce(p_includes, ''))) < 10 then raise exception 'Describe qué incluye el precio.'; end if;
  if p_materials_included is null then raise exception 'Indica si los materiales están incluidos.'; end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'La ventana de fecha y hora no es válida.';
  end if;
  if p_duration_hours is null or p_duration_hours <= 0 then raise exception 'Indica la duración estimada.'; end if;

  insert into public.quotes (
    job_id, pro_id, status, amount_dop, includes, excludes, materials_included,
    window_start, window_end, duration_hours, invited_at, responded_at, valid_until,
    revision_of, revision_reason
  ) values (
    p_job, j.pro_id, 'sent', p_amount_dop, btrim(p_includes), nullif(btrim(coalesce(p_excludes, '')), ''),
    p_materials_included, p_window_start, p_window_end, p_duration_hours, now(), now(), now() + interval '48 hours',
    j.approved_quote_id, btrim(p_reason)
  ) returning id into v_new;

  return v_new;
end;
$$;

-- Homeowner approves a revision. Records the new agreed price and the difference to pay or refund.
create or replace function public.approve_revision(p_quote uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  j record;
  v_original integer;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found or q.revision_of is null then raise exception 'Cambio no encontrado.'; end if;
  if not public.is_job_homeowner(q.job_id) then raise exception 'Solo quien pidió el trabajo puede aprobar el cambio.'; end if;
  if q.status <> 'sent' then raise exception 'Este cambio no se puede aprobar.'; end if;
  if q.valid_until <= now() then
    update public.quotes set status = 'expired' where id = q.id;
    raise exception 'El cambio venció. El profesional debe enviar uno nuevo.';
  end if;

  select * into j from public.jobs where id = q.job_id for update;
  if j.status <> 'in_progress' then raise exception 'El trabajo ya no está en curso.'; end if;

  -- The amount actually paid for the original quote is the base for every difference.
  select amount_dop into v_original from public.quotes
   where job_id = q.job_id and revision_of is null and status in ('accepted', 'superseded')
   limit 1;

  update public.quotes set status = 'superseded' where id = j.approved_quote_id;
  update public.quotes set status = 'accepted' where id = q.id;
  update public.jobs set
    approved_quote_id = q.id,
    pending_difference_dop = q.amount_dop - v_original
  where id = q.job_id;
end;
$$;

revoke execute on function public.propose_revision(uuid, integer, text, text, boolean, timestamptz, timestamptz, numeric, text) from public, anon;
revoke execute on function public.approve_revision(uuid) from public, anon;
grant execute on function public.propose_revision(uuid, integer, text, text, boolean, timestamptz, timestamptz, numeric, text) to authenticated;
grant execute on function public.approve_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deletion: also return and remove the customer's request photos and voice note
-- ---------------------------------------------------------------------------
drop function public.anonymise_customer(uuid);

create function public.anonymise_customer(p_customer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avatars text[];
  v_files text[];
begin
  if exists (select 1 from public.pros where id = p_customer) then
    raise exception 'Cierra tu perfil profesional antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.jobs
              where homeowner_id = p_customer and status not in ('completed', 'cancelled')) then
    raise exception 'Tienes trabajos abiertos. Ciérralos antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.payments p join public.jobs j on j.id = p.job_id
              where j.homeowner_id = p_customer and p.status in ('pending', 'held', 'disputed')) then
    raise exception 'Tienes pagos retenidos o en disputa. Espera a que se liberen antes de eliminar la cuenta.';
  end if;
  if exists (select 1 from public.disputes d join public.jobs j on j.id = d.job_id
              where d.status = 'open' and (j.homeowner_id = p_customer or d.opened_by = p_customer)) then
    raise exception 'Tienes una disputa abierta. Espera a que se resuelva antes de eliminar la cuenta.';
  end if;

  select array_remove(array[avatar_path], null) into v_avatars
    from public.profiles where id = p_customer;

  -- Customer's own request photos and voice note: personal data, removed.
  select coalesce(array_agg(x), '{}') into v_files from (
    select jp.storage_path as x
      from public.job_photos jp join public.jobs j on j.id = jp.job_id
     where j.homeowner_id = p_customer and jp.kind = 'request'
    union all
    select j.voice_path from public.jobs j
     where j.homeowner_id = p_customer and j.voice_path is not null
  ) s;

  delete from public.job_photos
   where kind = 'request' and job_id in (select id from public.jobs where homeowner_id = p_customer);

  update public.jobs set description = '[eliminado]', voice_path = null
   where homeowner_id = p_customer;
  delete from public.email_verifications where user_id = p_customer;
  update public.profiles
     set full_name = null, phone = null, email = null, email_verified_at = null,
         zone = null, avatar_path = null
   where id = p_customer;

  return jsonb_build_object(
    'avatars', to_jsonb(coalesce(v_avatars, '{}'::text[])),
    'job_files', to_jsonb(coalesce(v_files, '{}'::text[]))
  );
end;
$$;

revoke execute on function public.anonymise_customer(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_customer(uuid) to service_role;
