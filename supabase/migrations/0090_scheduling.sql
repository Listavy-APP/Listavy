-- 0090 · Scheduling (build queue item 4).
-- STATUS: NOT APPLIED. Sam reviews on the branch, Fabian gives the apply go, then it is applied and verified.
--
-- A. Job schedule. A job asks for "as soon as possible" (NULL, NULL) or one date + one window.
--    Windows, never exact times: morning 08:00-12:00, afternoon 12:00-17:00, evening 17:00-20:00.
--    No backfill: existing jobs keep NULL and display as "Lo antes posible".
-- B. Pro calendar. Weekly hours (one range per weekday, no split shifts) and days off.
--    Informational only. Nothing in this migration blocks a request, a quote, or an acceptance.
--    Matching and broadcast logic is unchanged.
-- C. Access. Owner-only RLS on the new tables. Public reads go through one SECURITY DEFINER
--    function that returns only the weekly summary and today's day-off flag. No existing policy changes.
--
-- Changes:
--   1. jobs: scheduled_date, scheduled_window, and a pair check.
--   2. Helper santo_domingo_today() (America/Santo_Domingo, no DST).
--   3. New table pro_weekly_hours (owner-only RLS).
--   4. New table pro_days_off (owner-only RLS).
--   5. get_pro_schedule(uuid): public summary for an approved pro.
--   6. create_job_request: two optional parameters (signature change; body = 0065 + schedule).
--   7. update_job_schedule(uuid, date, text): homeowner edits the schedule while status = 'requested'.
--   8. Trigger jobs_guard_schedule: schedule fields lock once status leaves 'requested' or a quote is accepted.

-- ---------------------------------------------------------------------------
-- 1. Job schedule columns
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column scheduled_date   date,
  add column scheduled_window text,
  add constraint jobs_scheduled_window_check
    check (scheduled_window is null or scheduled_window in ('morning', 'afternoon', 'evening')),
  add constraint jobs_schedule_pair_check
    check ((scheduled_date is null) = (scheduled_window is null));

-- ---------------------------------------------------------------------------
-- 2. Helper: today in the Dominican Republic
-- ---------------------------------------------------------------------------
create or replace function public.santo_domingo_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Santo_Domingo')::date
$$;

revoke all on function public.santo_domingo_today() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Weekly hours
-- ---------------------------------------------------------------------------
create table public.pro_weekly_hours (
  pro_id      uuid     not null references public.pros (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = domingo ... 6 = sábado (Postgres dow)
  enabled     boolean  not null default false,
  start_time  time,
  end_time    time,
  primary key (pro_id, weekday),
  constraint pro_weekly_hours_range_check check (
    (enabled and start_time is not null and end_time is not null and end_time > start_time)
    or (not enabled and start_time is null and end_time is null)
  )
);

alter table public.pro_weekly_hours enable row level security;

-- Owner-only. The pro is the row's owner (pros.id = auth.uid()). No admin policy: admin access goes
-- through definer functions only.
create policy pro_weekly_hours_owner_select on public.pro_weekly_hours for select
  using (pro_id = (select auth.uid()));
create policy pro_weekly_hours_owner_insert on public.pro_weekly_hours for insert
  with check (pro_id = (select auth.uid()));
create policy pro_weekly_hours_owner_update on public.pro_weekly_hours for update
  using (pro_id = (select auth.uid())) with check (pro_id = (select auth.uid()));
create policy pro_weekly_hours_owner_delete on public.pro_weekly_hours for delete
  using (pro_id = (select auth.uid()));

revoke all on public.pro_weekly_hours from anon;

-- ---------------------------------------------------------------------------
-- 4. Days off
-- ---------------------------------------------------------------------------
create table public.pro_days_off (
  pro_id      uuid        not null references public.pros (id) on delete cascade,
  day         date        not null,
  created_at  timestamptz not null default now(),
  primary key (pro_id, day)
);

alter table public.pro_days_off enable row level security;

create policy pro_days_off_owner_select on public.pro_days_off for select
  using (pro_id = (select auth.uid()));
create policy pro_days_off_owner_insert on public.pro_days_off for insert
  with check (pro_id = (select auth.uid()));
create policy pro_days_off_owner_delete on public.pro_days_off for delete
  using (pro_id = (select auth.uid()));

revoke all on public.pro_days_off from anon;

-- ---------------------------------------------------------------------------
-- 5. Public summary for a pro's profile
-- ---------------------------------------------------------------------------
-- Returns only the enabled weekly ranges and whether today (America/Santo_Domingo) is a day off.
-- Returns NULL for a pro who is not approved or has closed the profile.
create or replace function public.get_pro_schedule(p_pro uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not exists (
      select 1 from public.pros p
       where p.id = p_pro and p.verification_status = 'approved' and p.closed_at is null
    ) then null
    else jsonb_build_object(
      'weekly', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'weekday', w.weekday,
                 'start', to_char(w.start_time, 'HH24:MI'),
                 'end', to_char(w.end_time, 'HH24:MI'))
               order by w.weekday)
          from public.pro_weekly_hours w
         where w.pro_id = p_pro and w.enabled
      ), '[]'::jsonb),
      'off_today', exists (
        select 1 from public.pro_days_off d
         where d.pro_id = p_pro and d.day = public.santo_domingo_today()
      )
    )
  end
$$;

revoke all on function public.get_pro_schedule(uuid) from public;
grant execute on function public.get_pro_schedule(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. create_job_request with schedule (body = 0065 + schedule)
-- ---------------------------------------------------------------------------
drop function if exists public.create_job_request(text, text, text, text, uuid[], text[], text, text);

create function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text,
                                          p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text,
                                          p_requested_pro_type text default 'any',
                                          p_scheduled_date date default null,
                                          p_scheduled_window text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_pro uuid;
  v_open integer;
  v_unbooked integer;
  v_last_booking timestamptz;
  v_block_from timestamptz;
  v_price_ok boolean;
  v_available boolean;
  v_pro_city text;
  v_is_demo boolean;
  v_pro_type text;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_job_type not in ('repair', 'diagnostic') then raise exception 'Tipo de trabajo no válido.'; end if;
  if p_requested_pro_type is null then
    raise exception 'Elige si buscas persona, empresa o cualquiera.';
  end if;
  if p_requested_pro_type not in ('individual', 'company', 'any') then
    raise exception 'Tipo de profesional no válido.';
  end if;
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

  -- Schedule (0090). NULL, NULL means "Lo antes posible". Otherwise one date and one window.
  if (p_scheduled_date is null) <> (p_scheduled_window is null) then
    raise exception 'Elige fecha y horario, o Lo antes posible.';
  end if;
  if p_scheduled_date is not null then
    if p_scheduled_window not in ('morning', 'afternoon', 'evening') then
      raise exception 'Horario no válido.';
    end if;
    if p_scheduled_date < public.santo_domingo_today() then
      raise exception 'La fecha debe ser hoy o posterior.';
    end if;
    if p_scheduled_date > public.santo_domingo_today() + 60 then
      raise exception 'Puedes agendar hasta 60 días después de hoy.';
    end if;
  end if;

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

  select count(*) into v_open from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
  if v_open >= 3 then
    raise exception 'Ya tienes 3 solicitudes abiertas. Cancela una antes de pedir otra.';
  end if;

  foreach v_pro in array p_pro_ids loop
    -- Self-hire guard: a pro cannot request their own services, even when calling this directly.
    if v_pro = v_uid then
      raise exception 'No puedes contratarte a ti mismo. Elige otro profesional.';
    end if;
    select p.available, p.city, p.is_demo, p.pro_type into v_available, v_pro_city, v_is_demo, v_pro_type
      from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
    -- Demo gate (0058): a demonstration profile never receives a request, even when called directly.
    if v_is_demo then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Availability gate (UI phase §7, item 6).
    if not v_available then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- City gate (Phase 2): the pro must serve the city of the job's zone.
    if v_pro_city is distinct from public.city_of_zone(p_zone) then
      raise exception 'El profesional elegido no atiende en esta ciudad. Elige otro.';
    end if;
    -- Type gate (person vs company, Phase 1). 'any' accepts both.
    if p_requested_pro_type <> 'any' and v_pro_type is distinct from p_requested_pro_type then
      raise exception 'Un profesional elegido no coincide con el tipo que pediste (persona o empresa). Elige otro.';
    end if;
  end loop;

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path, requested_pro_type,
                           scheduled_date, scheduled_window)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path, p_requested_pro_type,
          p_scheduled_date, p_scheduled_window)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$function$;

revoke execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text) from public, anon;
grant execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Homeowner edits the schedule while the request is still 'requested'
-- ---------------------------------------------------------------------------
create or replace function public.update_job_schedule(p_job uuid, p_date date, p_window text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  j record;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  if j.homeowner_id <> v_uid then raise exception 'Solo quien pidió el trabajo puede cambiar el horario.'; end if;
  if j.status <> 'requested' or j.approved_quote_id is not null then
    raise exception 'El horario ya no se puede cambiar.';
  end if;

  if (p_date is null) <> (p_window is null) then
    raise exception 'Elige fecha y horario, o Lo antes posible.';
  end if;
  if p_date is not null then
    if p_window not in ('morning', 'afternoon', 'evening') then raise exception 'Horario no válido.'; end if;
    if p_date < public.santo_domingo_today() then raise exception 'La fecha debe ser hoy o posterior.'; end if;
    if p_date > public.santo_domingo_today() + 60 then
      raise exception 'Puedes agendar hasta 60 días después de hoy.';
    end if;
  end if;

  update public.jobs set scheduled_date = p_date, scheduled_window = p_window where id = p_job;
end;
$function$;

revoke execute on function public.update_job_schedule(uuid, date, text) from public, anon;
grant execute on function public.update_job_schedule(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Lock: schedule fields are fixed once the request leaves 'requested' or a quote is accepted.
-- ---------------------------------------------------------------------------
-- Applies to every write path, including direct updates. Admin writes that touch the schedule
-- are refused too; the schedule is a client decision.
create or replace function public.jobs_guard_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (new.scheduled_date, new.scheduled_window) is distinct from (old.scheduled_date, old.scheduled_window) then
    if old.status <> 'requested' or old.approved_quote_id is not null then
      raise exception 'El horario ya no se puede cambiar.';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.jobs_guard_schedule() from public, anon, authenticated;

create trigger jobs_guard_schedule
  before update of scheduled_date, scheduled_window on public.jobs
  for each row execute function public.jobs_guard_schedule();
