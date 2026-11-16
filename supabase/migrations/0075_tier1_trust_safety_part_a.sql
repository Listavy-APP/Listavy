-- 0075 Tier 1 Trust & Safety, Part A.
-- STATUS: DRAFT. NOT APPLIED. Needs Sam's review before it is applied.
--
-- A1. Dispute photo evidence (new bucket, new table, new RPC).
-- A2. Job-photo report queue (reports only; no automatic removal).
-- A3. Admin suspension of client accounts (blocks new job requests).
--
-- Storage: this adds ONE new bucket and its own policies. It does not alter any
-- existing bucket, storage policy, or can_view_job_photo(). Job-photo files are NOT hidden or removed here.
-- Every write goes through a security definer function. Clients have no direct table write.

-- ============================================================================
-- A1. Dispute photo evidence
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispute-evidence', 'dispute-evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table if not exists public.dispute_evidence_photos (
  id           uuid primary key default gen_random_uuid(),
  dispute_id   uuid not null references public.disputes (id),
  author_id    uuid not null references public.profiles (id),
  side         text not null check (side in ('homeowner', 'pro')),
  storage_path text not null unique,
  created_at   timestamptz not null default now(),
  -- Folder convention: <author uid>/<dispute id>/<file>
  constraint dispute_evidence_photos_path_owner
    check (storage_path like author_id::text || '/' || dispute_id::text || '/%')
);
alter table public.dispute_evidence_photos enable row level security;
revoke insert, update, delete on public.dispute_evidence_photos from public, anon, authenticated;

create policy dispute_evidence_photos_read on public.dispute_evidence_photos for select
  using (
    public.is_admin()
    or exists (select 1 from public.disputes d where d.id = dispute_id and public.is_job_party(d.job_id))
  );

-- Read gate for the storage object. Same audience as the table row.
create or replace function public.can_view_dispute_photo(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.dispute_evidence_photos p
     where p.storage_path = p_name
       and (
         public.is_admin()
         or exists (select 1 from public.disputes d where d.id = p.dispute_id and public.is_job_party(d.job_id))
       )
  );
$$;

-- Upload gate: the uploader's folder, an open evidence window, a party to the job,
-- and a written statement already on file (statement first, then photos).
create or replace function public.can_upload_dispute_photo(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.disputes d
     where d.id::text = (storage.foldername(p_name))[2]
       and (storage.foldername(p_name))[1] = (select auth.uid())::text
       and d.stage = 'evidence'
       and d.evidence_due_at is not null
       and now() < d.evidence_due_at
       and public.is_job_party(d.job_id)
       and exists (select 1 from public.dispute_evidence e
                    where e.dispute_id = d.id and e.author_id = (select auth.uid()))
  );
$$;

revoke execute on function public.can_view_dispute_photo(text) from public, anon;
revoke execute on function public.can_upload_dispute_photo(text) from public, anon;
grant execute on function public.can_view_dispute_photo(text) to authenticated;
grant execute on function public.can_upload_dispute_photo(text) to authenticated;

create policy dispute_evidence_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'dispute-evidence' and public.can_upload_dispute_photo(name));

create policy dispute_evidence_photos_view on storage.objects for select to authenticated
  using (bucket_id = 'dispute-evidence' and public.can_view_dispute_photo(name));

-- Registers an uploaded photo against the author's own statement. Max 6 per author per dispute.
create or replace function public.submit_dispute_photo(p_dispute uuid, p_path text)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  d record;
  uid uuid := (select auth.uid());
  v_side text;
  v_count integer;
begin
  select * into d from public.disputes where id = p_dispute;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if d.stage <> 'evidence' or d.evidence_due_at is null or now() >= d.evidence_due_at then
    raise exception 'La ventana de evidencia está cerrada.';
  end if;

  select e.side into v_side from public.dispute_evidence e
   where e.dispute_id = p_dispute and e.author_id = uid;
  if v_side is null then raise exception 'Primero envía tu declaración.'; end if;

  if not exists (select 1 from storage.objects o where o.bucket_id = 'dispute-evidence' and o.name = p_path) then
    raise exception 'La foto no se subió correctamente.';
  end if;

  select count(*) into v_count from public.dispute_evidence_photos
   where dispute_id = p_dispute and author_id = uid;
  if v_count >= 6 then raise exception 'Máximo 6 fotos por disputa.'; end if;

  insert into public.dispute_evidence_photos (dispute_id, author_id, side, storage_path)
  values (p_dispute, uid, v_side, p_path);
end;
$function$;

revoke execute on function public.submit_dispute_photo(uuid, text) from public, anon;
grant execute on function public.submit_dispute_photo(uuid, text) to authenticated;

-- ============================================================================
-- A2. Job-photo report queue
-- ============================================================================
-- Parties and quoted pros can report a photo they can already see.
-- Admin resolves each report: 'dismissed' or 'upheld'.
-- 'upheld' records the decision only. The file is NOT removed or hidden by this migration.
-- Hiding a file needs a change to can_view_job_photo(), which is a storage policy. Not in Part A.

create table if not exists public.job_photo_reports (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete cascade,
  storage_path    text not null references public.job_photos (storage_path) on delete cascade,
  reported_by     uuid not null references public.profiles (id),
  reason          text not null check (length(trim(reason)) >= 10),
  status          text not null default 'pending' check (status in ('pending', 'dismissed', 'upheld')),
  resolution_note text,
  resolved_by     uuid references public.profiles (id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (storage_path, reported_by)
);
alter table public.job_photo_reports enable row level security;
revoke insert, update, delete on public.job_photo_reports from public, anon, authenticated;

create policy job_photo_reports_read on public.job_photo_reports for select
  using (public.is_admin() or reported_by = (select auth.uid()));

create or replace function public.report_job_photo(p_path text, p_reason text)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  jp record;
begin
  select * into jp from public.job_photos where storage_path = p_path;
  if not found then raise exception 'Foto no encontrada.'; end if;
  if not public.can_view_job_photo(p_path) then raise exception 'No puedes reportar esta foto.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'Describe el motivo con al menos 10 caracteres.'; end if;
  if exists (select 1 from public.job_photo_reports r where r.storage_path = p_path and r.reported_by = (select auth.uid())) then
    raise exception 'Ya reportaste esta foto.';
  end if;

  insert into public.job_photo_reports (job_id, storage_path, reported_by, reason)
  values (jp.job_id, p_path, (select auth.uid()), trim(p_reason));
end;
$function$;

create or replace function public.admin_resolve_job_photo_report(p_id uuid, p_decision text, p_note text)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  r record;
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  if p_decision not in ('dismissed', 'upheld') then raise exception 'Decisión no válida.'; end if;
  if length(trim(coalesce(p_note, ''))) < 10 then raise exception 'Escribe una nota de al menos 10 caracteres.'; end if;

  update public.job_photo_reports
     set status = p_decision, resolution_note = trim(p_note),
         resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_id and status = 'pending'
  returning * into r;
  if not found then raise exception 'Reporte no encontrado o ya resuelto.'; end if;

  perform public.admin_log('job_photo_report_resolved', r.job_id,
    jsonb_build_object('report_id', r.id, 'decision', p_decision, 'note', trim(p_note)));
end;
$function$;

revoke execute on function public.report_job_photo(text, text) from public, anon;
revoke execute on function public.admin_resolve_job_photo_report(uuid, text, text) from public, anon;
grant execute on function public.report_job_photo(text, text) to authenticated;
grant execute on function public.admin_resolve_job_photo_report(uuid, text, text) to authenticated;

-- ============================================================================
-- A3. Client suspension (admin only). Blocks NEW job requests. Existing jobs continue.
-- ============================================================================

create table if not exists public.client_suspensions (
  client_id    uuid primary key references public.profiles (id),
  reason       text not null check (length(trim(reason)) >= 10),
  suspended_by uuid not null references public.profiles (id),
  suspended_at timestamptz not null default now()
);
alter table public.client_suspensions enable row level security;
revoke insert, update, delete on public.client_suspensions from public, anon, authenticated;

create policy client_suspensions_admin_read on public.client_suspensions for select
  using (public.is_admin());

create or replace function public.is_client_suspended(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.client_suspensions where client_id = p_client);
$$;

create or replace function public.admin_suspend_client(p_client uuid, p_reason text)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  if p_client = (select auth.uid()) then raise exception 'No puedes suspender tu propia cuenta.'; end if;
  -- Any non-admin account can be suspended as a client. A pro who also books jobs is covered.
  -- The trigger blocks only new job requests, not pro work.
  if not exists (select 1 from public.profiles where id = p_client and role <> 'admin') then
    raise exception 'Cuenta no encontrada o es de administrador.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'Escribe un motivo de al menos 10 caracteres.'; end if;
  if public.is_client_suspended(p_client) then raise exception 'La cuenta ya está suspendida.'; end if;

  insert into public.client_suspensions (client_id, reason, suspended_by)
  values (p_client, trim(p_reason), (select auth.uid()));

  perform public.admin_log('client_suspended', p_client, jsonb_build_object('reason', trim(p_reason)));
end;
$function$;

create or replace function public.admin_unsuspend_client(p_client uuid, p_reason text)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'Escribe un motivo de al menos 10 caracteres.'; end if;

  delete from public.client_suspensions where client_id = p_client;
  if not found then raise exception 'La cuenta no está suspendida.'; end if;

  perform public.admin_log('client_unsuspended', p_client, jsonb_build_object('reason', trim(p_reason)));
end;
$function$;

-- Block new requests from suspended clients. Separate trigger: the rating-limit trigger is unchanged.
-- create_job_request inserts into jobs, so this covers every creation path.
create or replace function public.block_jobs_when_client_suspended()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_client_suspended(new.homeowner_id) then
    raise exception 'Tu cuenta está suspendida. No puedes pedir nuevos trabajos. Contacta a Listavy para más información.';
  end if;
  return new;
end;
$$;

create trigger jobs_block_when_client_suspended
  before insert on public.jobs
  for each row execute function public.block_jobs_when_client_suspended();

revoke execute on function public.is_client_suspended(uuid) from public, anon;
revoke execute on function public.admin_suspend_client(uuid, text) from public, anon;
revoke execute on function public.admin_unsuspend_client(uuid, text) from public, anon;
grant execute on function public.is_client_suspended(uuid) to authenticated;
grant execute on function public.admin_suspend_client(uuid, text) to authenticated;
grant execute on function public.admin_unsuspend_client(uuid, text) to authenticated;
