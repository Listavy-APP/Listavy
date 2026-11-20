-- 0096 · Recurring bookings (queue item 7c).
-- A client turns a completed job into a series. The generator creates each future request
-- (invited to the same pro only). The pro quotes fresh every time. No charge is created here.
-- Writes go only through the definers below. Clients read their own rows; pros get no series access.
-- Schedule: supabase/ops/recurring_bookings_setup.sql (pg_cron, run once after this migration).

-- ---------------------------------------------------------------------------
-- 1. Lead time and date math (pure, immutable where possible).
-- ---------------------------------------------------------------------------

-- Days before the due date when the generator creates the request. A named constant on purpose.
create or replace function public.recurring_lead_days()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

-- Last day of the month that contains p_date.
create or replace function public.recurring_month_end(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')::date;
$$;

-- Monthly date for the given month: the anchor day, clamped to the month end.
create or replace function public.recurring_monthly_in_month(p_month_of date, p_anchor integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    extract(year from p_month_of)::int,
    extract(month from p_month_of)::int,
    least(p_anchor, extract(day from public.recurring_month_end(p_month_of))::int)
  );
$$;

-- First due date strictly after p_after.
create or replace function public.recurring_first_due(p_frequency text, p_anchor integer, p_after date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_delta integer;
  v_candidate date;
begin
  if p_frequency in ('weekly', 'biweekly') then
    -- extract(dow) gives 0 (Sunday) to 6 (Saturday), the same numbering as the anchor.
    v_delta := (p_anchor - extract(dow from p_after)::int + 7) % 7;
    if v_delta = 0 then v_delta := 7; end if;
    return p_after + v_delta;
  elsif p_frequency = 'monthly' then
    v_candidate := public.recurring_monthly_in_month(p_after, p_anchor);
    if v_candidate <= p_after then
      v_candidate := public.recurring_monthly_in_month((date_trunc('month', p_after::timestamp) + interval '1 month')::date, p_anchor);
    end if;
    return v_candidate;
  end if;
  raise exception 'Frecuencia no válida.';
end;
$$;

-- The due date after p_due. Monthly uses the anchor day, so a clamped month (Feb 28) does not drift.
create or replace function public.recurring_advance(p_frequency text, p_anchor integer, p_due date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_frequency = 'weekly' then return p_due + 7; end if;
  if p_frequency = 'biweekly' then return p_due + 14; end if;
  if p_frequency = 'monthly' then
    return public.recurring_monthly_in_month((date_trunc('month', p_due::timestamp) + interval '1 month')::date, p_anchor);
  end if;
  raise exception 'Frecuencia no válida.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

create table public.recurring_bookings (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.profiles (id) on delete cascade,
  pro_id            uuid not null references public.pros (id),
  source_job_id     uuid not null references public.jobs (id),
  trade             text not null check (trade in ('plumber', 'electrician', 'ac_technician')),
  zone              text not null,
  job_type          text not null default 'repair' check (job_type in ('repair', 'diagnostic')),
  description       text not null check (char_length(btrim(description)) >= 20),
  frequency         text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  -- weekly/biweekly: weekday 0 (Sunday) to 6 (Saturday). monthly: day of month 1 to 31, clamped at month end.
  anchor            integer not null,
  scheduled_window  text not null check (scheduled_window in ('morning', 'afternoon', 'evening')),
  status            text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  paused_reason     text check (paused_reason is null or paused_reason in ('pro_unavailable', 'client_suspended')),
  next_due_date     date not null,
  last_job_id       uuid references public.jobs (id),
  occurrences       integer not null default 0 check (occurrences >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((frequency in ('weekly', 'biweekly') and anchor between 0 and 6)
         or (frequency = 'monthly' and anchor between 1 and 31)),
  check ((paused_reason is null) or (status = 'paused'))
);

-- One live series (active or paused) per client and source job. Cancelled series do not block a new one.
create unique index recurring_one_live_per_source
  on public.recurring_bookings (client_id, source_job_id)
  where status in ('active', 'paused');

create index recurring_due_idx on public.recurring_bookings (next_due_date) where status = 'active';

-- Structural idempotency: at most one occurrence per series per due date, whatever the run count.
create table public.recurring_occurrences (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references public.recurring_bookings (id) on delete cascade,
  due_date    date not null,
  outcome     text not null check (outcome in ('created', 'skipped_cap')),
  job_id      uuid references public.jobs (id),
  created_at  timestamptz not null default now(),
  unique (series_id, due_date),
  check ((outcome = 'created') = (job_id is not null))
);

alter table public.recurring_bookings enable row level security;
alter table public.recurring_occurrences enable row level security;

-- Owner-only read. No insert, update or delete policy: writes go through the definers.
create policy recurring_bookings_select_owner on public.recurring_bookings
  for select to authenticated
  using (client_id = (select auth.uid()));

create policy recurring_occurrences_select_owner on public.recurring_occurrences
  for select to authenticated
  using (exists (select 1 from public.recurring_bookings r where r.id = series_id and r.client_id = (select auth.uid())));

revoke all on public.recurring_bookings from public, anon, authenticated;
revoke all on public.recurring_occurrences from public, anon, authenticated;
grant select on public.recurring_bookings to authenticated;
grant select on public.recurring_occurrences to authenticated;

-- ---------------------------------------------------------------------------
-- 3a. Suspension trigger for the generator. is_client_suspended raises when no user is signed in,
--     so the cron context (no auth.uid) would fail every insert. With no user, read the table directly.
--     Same rule: a client with any client_suspensions row cannot receive a new request.
-- ---------------------------------------------------------------------------

create or replace function public.block_jobs_when_client_suspended()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    if exists (select 1 from public.client_suspensions where client_id = new.homeowner_id) then
      raise exception 'Tu cuenta está suspendida. No puedes pedir nuevos trabajos. Contacta a Listavy para más información.';
    end if;
  elsif public.is_client_suspended(new.homeowner_id) then
    raise exception 'Tu cuenta está suspendida. No puedes pedir nuevos trabajos. Contacta a Listavy para más información.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Client definers.
-- ---------------------------------------------------------------------------

create or replace function public.create_recurring_booking(p_source_job uuid, p_frequency text, p_anchor integer, p_window text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  j record;
  v_pro_ok boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;

  select * into j from public.jobs where id = p_source_job and homeowner_id = v_uid;
  if not found then raise exception 'No encontramos ese trabajo.'; end if;
  if j.status <> 'completed' then raise exception 'Solo puedes repetir un trabajo terminado.'; end if;
  if j.pro_id is null then raise exception 'Este trabajo no tiene profesional.'; end if;

  -- The pro is fixed to the source job's pro in v1. The pro must still be approved and not a demo profile.
  select exists (select 1 from public.pros p
                  where p.id = j.pro_id and p.verification_status = 'approved' and not p.is_demo)
    into v_pro_ok;
  if not v_pro_ok then raise exception 'Este profesional ya no atiende solicitudes. Pide una cotización nueva.'; end if;

  if p_frequency not in ('weekly', 'biweekly', 'monthly') then raise exception 'Frecuencia no válida.'; end if;
  if p_frequency in ('weekly', 'biweekly') then
    if p_anchor is null or p_anchor not between 0 and 6 then raise exception 'Elige un día de la semana.'; end if;
  else
    if p_anchor is null or p_anchor not between 1 and 31 then raise exception 'Elige un día del mes entre 1 y 31.'; end if;
  end if;
  if p_window not in ('morning', 'afternoon', 'evening') then raise exception 'Horario no válido.'; end if;

  if exists (select 1 from public.recurring_bookings r
              where r.client_id = v_uid and r.source_job_id = p_source_job and r.status in ('active', 'paused')) then
    raise exception 'Ya tienes una serie recurrente para este trabajo.';
  end if;

  insert into public.recurring_bookings (client_id, pro_id, source_job_id, trade, zone, job_type, description,
                                         frequency, anchor, scheduled_window, next_due_date)
  values (v_uid, j.pro_id, j.id, j.trade, j.zone, j.job_type, btrim(j.description),
          p_frequency, p_anchor, p_window,
          public.recurring_first_due(p_frequency, p_anchor, public.santo_domingo_today()))
  returning id into v_id;

  return v_id;
end;
$$;

-- Pause, resume or cancel one series. Owner only.
create or replace function public.set_recurring_booking_status(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r record;
  v_today date := public.santo_domingo_today();
  v_pro_ok boolean;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  select * into r from public.recurring_bookings where id = p_id and client_id = v_uid for update;
  if not found then raise exception 'No encontramos esa serie.'; end if;

  if p_action = 'pause' then
    if r.status <> 'active' then raise exception 'Esta serie no está activa.'; end if;
    update public.recurring_bookings set status = 'paused', paused_reason = null, updated_at = now() where id = p_id;

  elsif p_action = 'resume' then
    if r.status <> 'paused' then raise exception 'Esta serie no está pausada.'; end if;
    select exists (select 1 from public.pros p
                    where p.id = r.pro_id and p.verification_status = 'approved' and not p.is_demo
                      and p.available and p.trade = r.trade and p.city = public.city_of_zone(r.zone))
      into v_pro_ok;
    if exists (select 1 from public.client_suspensions where client_id = v_uid) then
      raise exception 'Tu cuenta está suspendida. No podemos reanudar la serie.';
    end if;
    if not v_pro_ok then raise exception 'Tu profesional no está disponible para este servicio. No podemos reanudar la serie.'; end if;
    update public.recurring_bookings
       set status = 'active',
           paused_reason = null,
           -- A due date in the past is replaced by the next valid date, so a resume never fires late occurrences.
           next_due_date = case when next_due_date > v_today then next_due_date
                                else public.recurring_first_due(frequency, anchor, v_today) end,
           updated_at = now()
     where id = p_id;

  elsif p_action = 'cancel' then
    if r.status not in ('active', 'paused') then raise exception 'Esta serie ya está cancelada.'; end if;
    update public.recurring_bookings set status = 'cancelled', paused_reason = null, updated_at = now() where id = p_id;

  else
    raise exception 'Acción no válida.';
  end if;
end;
$$;

revoke execute on function public.create_recurring_booking(uuid, text, integer, text) from public, anon;
grant execute on function public.create_recurring_booking(uuid, text, integer, text) to authenticated;
revoke execute on function public.set_recurring_booking_status(uuid, text) from public, anon;
grant execute on function public.set_recurring_booking_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Generator. Called by pg_cron (postgres role) and the service role only.
-- ---------------------------------------------------------------------------

create or replace function public.run_recurring_bookings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_today date := public.santo_domingo_today();
  v_lead integer := public.recurring_lead_days();
  v_open_ok boolean;
  v_open_requests integer;
  v_job uuid;
  v_created integer := 0;
  v_capped integer := 0;
  v_paused integer := 0;
begin
  for r in
    select * from public.recurring_bookings
     where status = 'active' and next_due_date <= v_today + v_lead
     order by next_due_date, id
     for update skip locked
  loop
    -- Catch-up without backfill: a due date already in the past is advanced, never turned into a request.
    -- After one creation the next due date is always more than the lead time away, so a second run
    -- on the same day finds nothing due.
    if r.next_due_date < v_today then
      update public.recurring_bookings set next_due_date = public.recurring_first_due(frequency, anchor, v_today - 1), updated_at = now()
       where id = r.id;
      continue;
    end if;

    -- Suspended client: pause without a request and without a notice. The account is under review.
    if exists (select 1 from public.client_suspensions where client_id = r.client_id) then
      update public.recurring_bookings set status = 'paused', paused_reason = 'client_suspended', updated_at = now() where id = r.id;
      v_paused := v_paused + 1;
      continue;
    end if;

    -- Pro gate, mirrored from create_job_request. Failing it pauses the series and notifies the client.
    select exists (select 1 from public.pros p
                    where p.id = r.pro_id and p.verification_status = 'approved' and not p.is_demo
                      and p.available and p.trade = r.trade and p.city = public.city_of_zone(r.zone))
      into v_open_ok;
    if not v_open_ok then
      update public.recurring_bookings set status = 'paused', paused_reason = 'pro_unavailable', updated_at = now() where id = r.id;
      perform public.notify_user_push(r.client_id, 'recurring_auto_paused', 'Pausamos tu trabajo recurrente',
        'Tu profesional ya no está disponible para este servicio. Revisa tus trabajos recurrentes.', '/cuenta/recurrentes', false);
      -- Email too: a client whose series stops must not be able to miss it. p_always skips the
      -- job-email preference; the unverified-address rule inside notify_user_email still applies.
      perform public.notify_user_email(r.client_id, 'recurring_auto_paused', jsonb_build_object('trade', r.trade), true, false);
      v_paused := v_paused + 1;
      continue;
    end if;

    -- Standing cap: the same open-status set and limit as create_job_request.
    select count(*) into v_open_requests from public.jobs
     where homeowner_id = r.client_id
       and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
    if v_open_requests >= 3 then
      insert into public.recurring_occurrences (series_id, due_date, outcome) values (r.id, r.next_due_date, 'skipped_cap');
      update public.recurring_bookings
         set next_due_date = public.recurring_advance(frequency, anchor, next_due_date), updated_at = now()
       where id = r.id;
      perform public.notify_user_push(r.client_id, 'recurring_skipped_cap', 'No creamos la solicitud de esta vez',
        'Tienes 3 solicitudes abiertas. Cancela una para que la próxima se pueda crear.', '/trabajos', false);
      v_capped := v_capped + 1;
      continue;
    end if;

    -- Create the request. The unique key on recurring_occurrences guards the due date.
    insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, requested_pro_type,
                             scheduled_date, scheduled_window)
    values (r.client_id, r.trade, r.zone, r.description, 'requested', r.job_type, 'any',
            r.next_due_date, r.scheduled_window)
    returning id into v_job;

    insert into public.quotes (job_id, pro_id, status, invited_at)
    values (v_job, r.pro_id, 'invited', now());

    insert into public.recurring_occurrences (series_id, due_date, outcome, job_id)
    values (r.id, r.next_due_date, 'created', v_job);

    update public.recurring_bookings
       set last_job_id = v_job,
           occurrences = occurrences + 1,
           next_due_date = public.recurring_advance(frequency, anchor, next_due_date),
           updated_at = now()
     where id = r.id;

    perform public.notify_user_push(r.client_id, 'recurring_created', 'Creamos tu próxima solicitud',
      'Tu profesional ya recibió la solicitud recurrente. Revisa el horario.', '/trabajos/' || v_job, false);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped_cap', v_capped, 'paused', v_paused);
end;
$$;

revoke execute on function public.run_recurring_bookings() from public, anon, authenticated;
grant execute on function public.run_recurring_bookings() to service_role;
