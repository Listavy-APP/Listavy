-- Listavy · 0011 · Sprint 2 job flow.
-- Decisions (operations plan 4.1, 4.2, 5; D7, D8, D9, D13; approved 2026-11-11):
--   * The jobs row is the request header. One quotes row per invited pro (max 3), status 'invited' until it quotes.
--   * Pro response SLA 24h from invite. Quote valid 48h from quote time.
--   * Phone reveal requires booked (quote approved) AND payment_status = 'paid' (D7).
--   * payment_status = 'paid' is set ONLY by test_mark_job_paid (service_role). Replaced by the Stripe webhook in Sprint 3.
--     REMOVE test_mark_job_paid before Sprint 5.
--   * Completion code: generated at start_job, shown to the pro, typed by the homeowner at approval. 5 failed attempts lock it.
--   * Diagnostic visit: job_type 'diagnostic', price RD$500-1,000, closes with the pro's written diagnosis and a homeowner confirmation (no photo close-out).
--   * All writes go through security definer functions. Direct insert/update on jobs and quotes is removed for clients.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column job_type text not null default 'repair' check (job_type in ('repair', 'diagnostic')),
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'held', 'released', 'refunded')),
  add column approved_quote_id uuid references public.quotes (id),
  add column booked_at timestamptz,
  add column closed_at timestamptz,
  add column approved_at timestamptz,
  add column voice_path text,
  add column diagnosis_text text;

alter table public.quotes
  alter column amount_dop drop not null,
  add column invited_at timestamptz not null default now(),
  add column responded_at timestamptz,
  add column valid_until timestamptz,
  add column includes text,
  add column excludes text,
  add column materials_included boolean,
  add column window_start timestamptz,
  add column window_end timestamptz,
  add column duration_hours numeric(5, 2) check (duration_hours > 0);

alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check
    check (status in ('invited', 'declined', 'sent', 'accepted', 'rejected', 'withdrawn', 'expired')),
  add constraint quotes_amount_when_sent
    check (status not in ('sent', 'accepted') or amount_dop is not null);

-- ---------------------------------------------------------------------------
-- 2. Photos (request, before, after) and secrets
-- ---------------------------------------------------------------------------
create table public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  uploaded_by  uuid not null references public.profiles (id),
  kind         text not null check (kind in ('request', 'before', 'after')),
  storage_path text not null unique,
  created_at   timestamptz not null default now()
);
alter table public.job_photos enable row level security;

create policy job_photos_select on public.job_photos for select
  using (
    public.is_job_party(job_id)
    or public.has_quoted_job(job_id)
    or public.is_admin()
  );

-- Completion code and attempt counter. No client policy: the code is only reachable through functions.
create table public.job_secrets (
  job_id          uuid primary key references public.jobs (id) on delete cascade,
  completion_code text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0)
);
alter table public.job_secrets enable row level security;
revoke all on public.job_secrets from public, anon, authenticated;

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

-- Folder = uploader's uid, same convention as customer-avatars.
create policy job_photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.can_view_job_photo(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.job_photos jp
     where jp.storage_path = p_name
       and (public.is_job_party(jp.job_id) or public.has_quoted_job(jp.job_id) or public.is_admin())
  );
$$;
revoke execute on function public.can_view_job_photo(text) from public, anon;
grant execute on function public.can_view_job_photo(text) to authenticated;

create policy job_photos_select_party on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.can_view_job_photo(name));

-- ---------------------------------------------------------------------------
-- 3. Remove direct client writes. Functions below are the only write path.
-- ---------------------------------------------------------------------------
drop policy if exists jobs_insert_homeowner on public.jobs;
drop policy if exists jobs_update_homeowner on public.jobs;
drop policy if exists quotes_insert_pro on public.quotes;
drop policy if exists quotes_update_pro on public.quotes;

create policy jobs_update_admin on public.jobs for update
  using (public.is_admin()) with check (public.is_admin());
create policy quotes_update_admin on public.quotes for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------------

-- Homeowner sends a request to 1-3 approved pros of the same trade.
create or replace function public.create_job_request(
  p_trade text,
  p_zone text,
  p_description text,
  p_job_type text,
  p_pro_ids uuid[],
  p_photo_paths text[],
  p_voice_path text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_pro uuid;
  v_open integer;
  v_unbooked integer;
  v_last_booking timestamptz;
  v_block_from timestamptz;
  v_price_ok boolean;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_job_type not in ('repair', 'diagnostic') then raise exception 'Tipo de trabajo no válido.'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 20 then
    raise exception 'Describe el problema con al menos 20 caracteres.';
  end if;
  if p_photo_paths is null or cardinality(p_photo_paths) < 1 then
    raise exception 'Agrega al menos una foto del problema.';
  end if;
  if p_pro_ids is null or cardinality(p_pro_ids) < 1 or cardinality(p_pro_ids) > 3 then
    raise exception 'Elige entre 1 y 3 profesionales.';
  end if;
  if (select count(distinct x) from unnest(p_pro_ids) x) <> cardinality(p_pro_ids) then
    raise exception 'Hay profesionales repetidos.';
  end if;

  -- Anti-ghosting (plan 5.2): counter resets on booking; 5 unbooked in 30 days blocks for 14 days.
  select max(booked_at) into v_last_booking from public.jobs where homeowner_id = v_uid;
  select count(*) into v_unbooked from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted')
     and created_at > now() - interval '30 days'
     and (v_last_booking is null or created_at > v_last_booking);
  if v_unbooked >= 5 then
    select created_at into v_block_from from public.jobs
     where homeowner_id = v_uid and status in ('requested', 'quoted')
       and created_at > now() - interval '30 days'
       and (v_last_booking is null or created_at > v_last_booking)
     order by created_at desc offset 4 limit 1;
    if now() < v_block_from + interval '14 days' then
      raise exception 'Tienes demasiadas solicitudes sin contratar. Puedes pedir cotizaciones de nuevo en 14 días.';
    end if;
  end if;

  -- Max 3 active requests per client (plan 5.2).
  select count(*) into v_open from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
  if v_open >= 3 then
    raise exception 'Ya tienes 3 solicitudes abiertas. Cancela una antes de pedir otra.';
  end if;

  foreach v_pro in array p_pro_ids loop
    select true into v_price_ok from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
  end loop;

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$$;

-- Pro declines an invite. Free, no penalty (plan 5.3).
create or replace function public.decline_invite(p_quote uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.quotes set status = 'declined', responded_at = now()
   where id = p_quote and pro_id = (select auth.uid()) and status = 'invited';
  if not found then raise exception 'Esta solicitud ya no está disponible.'; end if;
end;
$$;

-- Pro quotes a fixed price. Invite must be under 24h old (plan 5.2).
create or replace function public.submit_quote(
  p_quote uuid,
  p_amount_dop integer,
  p_includes text,
  p_excludes text,
  p_materials_included boolean,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_duration_hours numeric
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  j record;
begin
  select * into q from public.quotes where id = p_quote and pro_id = (select auth.uid()) for update;
  if not found then raise exception 'Esta solicitud no es tuya.'; end if;
  if q.status <> 'invited' then raise exception 'Esta solicitud ya no acepta cotizaciones.'; end if;
  if q.invited_at < now() - interval '24 hours' then
    update public.quotes set status = 'expired' where id = q.id;
    raise exception 'Se venció el plazo de 24 horas para responder.';
  end if;

  select * into j from public.jobs where id = q.job_id;
  if j.status not in ('requested', 'quoted') then raise exception 'Esta solicitud ya no está abierta.'; end if;

  if j.job_type = 'diagnostic' and (p_amount_dop < 500 or p_amount_dop > 1000) then
    raise exception 'La visita de diagnóstico cuesta entre RD$500 y RD$1,000.';
  end if;
  if p_amount_dop is null or p_amount_dop <= 0 then raise exception 'Escribe un precio válido.'; end if;
  if char_length(btrim(coalesce(p_includes, ''))) < 10 then raise exception 'Describe qué incluye el precio.'; end if;
  if p_materials_included is null then raise exception 'Indica si los materiales están incluidos.'; end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'La ventana de fecha y hora no es válida.';
  end if;
  if p_duration_hours is null or p_duration_hours <= 0 then raise exception 'Indica la duración estimada.'; end if;

  update public.quotes set
    status = 'sent',
    amount_dop = p_amount_dop,
    includes = btrim(p_includes),
    excludes = nullif(btrim(coalesce(p_excludes, '')), ''),
    materials_included = p_materials_included,
    window_start = p_window_start,
    window_end = p_window_end,
    duration_hours = p_duration_hours,
    responded_at = now(),
    valid_until = now() + interval '48 hours'
  where id = q.id;

  update public.jobs set status = 'quoted' where id = q.job_id and status = 'requested';
end;
$$;

-- Homeowner approves ONE quote. This books the job. It does not take payment.
create or replace function public.approve_quote(p_quote uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if not public.is_job_homeowner(q.job_id) then raise exception 'Solo quien pidió el trabajo puede aprobarla.'; end if;
  if q.status <> 'sent' then raise exception 'Esta cotización no se puede aprobar.'; end if;
  if q.valid_until <= now() then
    update public.quotes set status = 'expired' where id = q.id;
    raise exception 'La cotización venció. Pide una nueva al profesional.';
  end if;

  update public.quotes set status = 'accepted' where id = q.id;
  update public.quotes set status = 'rejected'
   where job_id = q.job_id and id <> q.id and status in ('invited', 'sent');

  update public.jobs set
    pro_id = q.pro_id,
    status = 'accepted',
    approved_quote_id = q.id,
    booked_at = now()
  where id = q.job_id;

  return q.job_id;
end;
$$;

-- Homeowner cancels before work starts. Free (plan 1.4).
create or replace function public.cancel_job_request(p_job uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_job_homeowner(p_job) then raise exception 'Solo quien pidió el trabajo puede cancelarla.'; end if;
  update public.jobs set status = 'cancelled'
   where id = p_job and status in ('requested', 'quoted');
  if not found then raise exception 'Este trabajo ya no se puede cancelar.'; end if;
  update public.quotes set status = 'withdrawn'
   where job_id = p_job and status in ('invited', 'sent');
end;
$$;

-- Pro adds a before or after photo. Path folder must be the pro's uid.
create or replace function public.add_job_photo(p_job uuid, p_kind text, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  j record;
begin
  select * into j from public.jobs where id = p_job;
  if not found or j.pro_id is distinct from (select auth.uid()) then raise exception 'Solo el profesional asignado puede subir fotos.'; end if;
  if p_kind not in ('before', 'after') then raise exception 'Tipo de foto no válido.'; end if;
  if p_kind = 'before' and j.status not in ('accepted', 'in_progress') then raise exception 'Las fotos de antes se suben al llegar.'; end if;
  if p_kind = 'after' and j.status <> 'in_progress' then raise exception 'Las fotos de después se suben al terminar.'; end if;
  if split_part(p_path, '/', 1) <> (select auth.uid())::text then raise exception 'Ruta de foto no válida.'; end if;
  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  values (p_job, (select auth.uid()), p_kind, p_path);
end;
$$;

-- Test-only payment stub. service_role only. Replaced by the Stripe webhook in Sprint 3. REMOVE before Sprint 5.
create or replace function public.test_mark_job_paid(p_job uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.jobs set payment_status = 'paid'
   where id = p_job and status = 'accepted' and payment_status = 'unpaid';
  if not found then raise exception 'El trabajo no está listo para pago.'; end if;
end;
$$;
revoke execute on function public.test_mark_job_paid(uuid) from public, anon, authenticated;
grant execute on function public.test_mark_job_paid(uuid) to service_role;

-- Pro starts the job. Requires booked + paid + a before photo. Generates the completion code.
create or replace function public.start_job(p_job uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  j record;
  v_code text;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found or j.pro_id is distinct from (select auth.uid()) then raise exception 'Solo el profesional asignado puede iniciar.'; end if;
  if j.status <> 'accepted' then raise exception 'El trabajo no está listo para iniciar.'; end if;
  if j.payment_status <> 'paid' then raise exception 'El pago aún no está confirmado.'; end if;
  if j.job_type = 'repair' and not exists (
       select 1 from public.job_photos where job_id = p_job and kind = 'before') then
    raise exception 'Sube al menos una foto de antes para iniciar.';
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into public.job_secrets (job_id, completion_code, failed_attempts)
  values (p_job, v_code, 0)
  on conflict (job_id) do update set completion_code = excluded.completion_code, failed_attempts = 0;

  update public.jobs set status = 'in_progress' where id = p_job;
end;
$$;

-- Pro reads the completion code (to give it to the homeowner on site).
create or replace function public.get_completion_code(p_job uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not exists (select 1 from public.jobs where id = p_job and pro_id = (select auth.uid())) then
    raise exception 'Solo el profesional asignado puede ver el código.';
  end if;
  select completion_code into v_code from public.job_secrets where job_id = p_job;
  return v_code;
end;
$$;

-- Pro submits the close-out. Repair needs an after photo. Diagnostic needs the written diagnosis.
create or replace function public.submit_closeout(p_job uuid, p_diagnosis text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  j record;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found or j.pro_id is distinct from (select auth.uid()) then raise exception 'Solo el profesional asignado puede cerrar.'; end if;
  if j.status <> 'in_progress' then raise exception 'El trabajo no está en curso.'; end if;

  if j.job_type = 'diagnostic' then
    if char_length(btrim(coalesce(p_diagnosis, ''))) < 20 then
      raise exception 'Escribe el diagnóstico con al menos 20 caracteres.';
    end if;
    update public.jobs set diagnosis_text = btrim(p_diagnosis), status = 'awaiting_approval', closed_at = now()
     where id = p_job;
  else
    if not exists (select 1 from public.job_photos where job_id = p_job and kind = 'after') then
      raise exception 'Sube al menos una foto de después.';
    end if;
    update public.jobs set status = 'awaiting_approval', closed_at = now() where id = p_job;
  end if;
end;
$$;

-- Homeowner approves the close-out. Repair: completion code required (5 tries max). Diagnostic: one-tap confirmation.
create or replace function public.approve_closeout(p_job uuid, p_code text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  j record;
  s record;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found or not public.is_job_homeowner(p_job) then raise exception 'Solo quien pidió el trabajo puede aprobarlo.'; end if;
  if j.status <> 'awaiting_approval' then raise exception 'El trabajo no está esperando aprobación.'; end if;

  if j.job_type = 'repair' then
    select * into s from public.job_secrets where job_id = p_job for update;
    if s.failed_attempts >= 5 then
      raise exception 'Demasiados intentos. Pide ayuda al equipo de Listavy.';
    end if;
    if p_code is distinct from s.completion_code then
      update public.job_secrets set failed_attempts = failed_attempts + 1 where job_id = p_job;
      raise exception 'Código incorrecto.';
    end if;
  end if;

  update public.jobs set status = 'completed', approved_at = now() where id = p_job;
end;
$$;

-- Contact reveal (plan D7): booked AND paid AND the job is in an active or closed state.
create or replace function public.get_contact(p_job uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  j record;
  v_phone text;
begin
  select * into j from public.jobs where id = p_job;
  if not found then return null; end if;
  if j.payment_status <> 'paid' then return null; end if;
  if j.status not in ('accepted', 'in_progress', 'awaiting_approval', 'completed') then return null; end if;

  if (select auth.uid()) = j.homeowner_id then
    select phone into v_phone from public.profiles where id = j.pro_id;
  elsif (select auth.uid()) = j.pro_id then
    select phone into v_phone from public.profiles where id = j.homeowner_id;
  end if;
  return v_phone;
end;
$$;

-- Scheduled sweep (Edge Function or pg_cron, Sprint 2 follow-up). Service role only.
create or replace function public.expire_quotes()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  update public.quotes set status = 'expired'
   where status = 'invited' and invited_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  update public.quotes set status = 'expired'
   where status = 'sent' and valid_until < now();
  return n;
end;
$$;
revoke execute on function public.expire_quotes() from public, anon, authenticated;
grant execute on function public.expire_quotes() to service_role;

-- Grants for client-callable functions.
revoke execute on function public.create_job_request(text, text, text, text, uuid[], text[], text) from public, anon;
revoke execute on function public.decline_invite(uuid, text) from public, anon;
revoke execute on function public.submit_quote(uuid, integer, text, text, boolean, timestamptz, timestamptz, numeric) from public, anon;
revoke execute on function public.approve_quote(uuid) from public, anon;
revoke execute on function public.cancel_job_request(uuid) from public, anon;
revoke execute on function public.add_job_photo(uuid, text, text) from public, anon;
revoke execute on function public.start_job(uuid) from public, anon;
revoke execute on function public.get_completion_code(uuid) from public, anon;
revoke execute on function public.submit_closeout(uuid, text) from public, anon;
revoke execute on function public.approve_closeout(uuid, text) from public, anon;
revoke execute on function public.get_contact(uuid) from public, anon;

grant execute on function public.create_job_request(text, text, text, text, uuid[], text[], text) to authenticated;
grant execute on function public.decline_invite(uuid, text) to authenticated;
grant execute on function public.submit_quote(uuid, integer, text, text, boolean, timestamptz, timestamptz, numeric) to authenticated;
grant execute on function public.approve_quote(uuid) to authenticated;
grant execute on function public.cancel_job_request(uuid) to authenticated;
grant execute on function public.add_job_photo(uuid, text, text) to authenticated;
grant execute on function public.start_job(uuid) to authenticated;
grant execute on function public.get_completion_code(uuid) to authenticated;
grant execute on function public.submit_closeout(uuid, text) to authenticated;
grant execute on function public.approve_closeout(uuid, text) to authenticated;
grant execute on function public.get_contact(uuid) to authenticated;
