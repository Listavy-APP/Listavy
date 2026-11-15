-- 0063 Job follow-ups, foundation (in-app only). Not applied. Sam reviews on the preview.
--
-- 1. jobs.started_at, set by start_job (real start time; the quote window alone is not enough).
-- 2. job_notifications: in-app check-ins to the client, with read/unread and a one-tap answer.
--    One row per (job, trigger), so a job gets at most three check-ins.
-- 3. run_job_checkins(): scheduled every 15 minutes with pg_cron. It creates due check-ins.
--    Sends nothing outside 08:00-19:59 Santo Domingo time, and at most one arrival/mid-job check-in per client per day.
--    Overrun is exempt from the daily cap. At most one check-in per job per trigger (unique job_id, kind).
-- 4. Triggers: arrival (start_job, or window start passed with no start), mid-job (halfway through the
--    quoted window, still in progress), overrun (window end passed, still in progress).
-- No WhatsApp sending here. WhatsApp waits for the Meta sender (Step 5).
-- dispute-reminders (hourly, run_dispute_reminders) is already scheduled on production. Not scheduled again here.
-- pg_cron schedules live in supabase/ops/, not in migrations (same as release/refund flows).

-- 1. Real start time. ----------------------------------------------------------------------
alter table public.jobs add column if not exists started_at timestamptz;

-- 2. Check-in notifications. -----------------------------------------------------------------
create table if not exists public.job_notifications (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('arrival', 'midjob', 'overrun')),
  body          text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  answer        text check (answer in ('yes', 'no', 'ok', 'running', 'finished', 'problem')),
  answered_at   timestamptz,
  problem_reported_at timestamptz,
  problem_resolved_at timestamptz,
  unique (job_id, kind)
);

create index if not exists job_notifications_recipient_idx
  on public.job_notifications (recipient_id, created_at desc);

alter table public.job_notifications enable row level security;
drop policy if exists job_notifications_select_own on public.job_notifications;
create policy job_notifications_select_own on public.job_notifications
  for select using (recipient_id = (select auth.uid()));
revoke insert, update, delete on public.job_notifications from authenticated, anon;
grant select on public.job_notifications to authenticated;

-- Answers allowed per trigger. A client answers only their own notification.
create or replace function public.answer_job_checkin(p_notification uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n record;
begin
  select * into n from public.job_notifications where id = p_notification for update;
  if not found or n.recipient_id is distinct from (select auth.uid()) then
    raise exception 'No encontramos ese aviso.';
  end if;
  -- Validate first, so a wrong answer is refused even on a row that was already answered.
  if not (
       (n.kind = 'arrival' and p_answer in ('yes', 'no'))
    or (n.kind = 'midjob' and p_answer in ('ok', 'problem'))
    or (n.kind = 'overrun' and p_answer in ('running', 'finished', 'problem'))
  ) then
    raise exception 'Respuesta no válida.';
  end if;
  -- One answer per check-in. A second tap changes nothing.
  if n.answer is not null then return; end if;
  update public.job_notifications set
    answer = p_answer,
    answered_at = now(),
    read_at = coalesce(read_at, now()),
    problem_reported_at = case when p_answer in ('no', 'problem') then now() else problem_reported_at end
  where id = p_notification;
end;
$$;

create or replace function public.mark_job_notification_read(p_notification uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.job_notifications set read_at = coalesce(read_at, now())
   where id = p_notification and recipient_id = (select auth.uid());
$$;

revoke execute on function public.answer_job_checkin(uuid, text) from public, anon;
revoke execute on function public.mark_job_notification_read(uuid) from public, anon;
grant execute on function public.answer_job_checkin(uuid, text) to authenticated;
grant execute on function public.mark_job_notification_read(uuid) to authenticated;

-- Admin view of reported problems. Admins only (TOTP session, via is_admin()).
create or replace function public.admin_list_checkin_problems()
returns table (id uuid, job_id uuid, kind text, answer text, body text, problem_reported_at timestamptz,
               client_name text, trade text, zone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  return query
    select n.id, n.job_id, n.kind, n.answer, n.body, n.problem_reported_at,
           p.full_name, j.trade, j.zone
      from public.job_notifications n
      join public.jobs j on j.id = n.job_id
      join public.profiles p on p.id = n.recipient_id
     where n.problem_reported_at is not null
       and n.problem_resolved_at is null
     order by n.problem_reported_at desc
     limit 100;
end;
$$;

create or replace function public.admin_resolve_checkin_problem(p_notification uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_job uuid;
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  update public.job_notifications set problem_resolved_at = now()
   where id = p_notification and problem_reported_at is not null and problem_resolved_at is null
  returning job_id into v_job;
  if v_job is null then raise exception 'No hay un problema abierto con ese aviso.'; end if;
  perform public.admin_log('checkin_problem_resolved', v_job, jsonb_build_object('notification', p_notification));
end;
$$;

revoke execute on function public.admin_list_checkin_problems() from public, anon;
revoke execute on function public.admin_resolve_checkin_problem(uuid) from public, anon;
grant execute on function public.admin_list_checkin_problems() to authenticated;
grant execute on function public.admin_resolve_checkin_problem(uuid) to authenticated;

-- 3. start_job: same body as 0011, plus started_at and the arrival check-in. -------------
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

  update public.jobs set status = 'in_progress', started_at = now() where id = p_job;

  -- Arrival check-in: the pro just said they arrived. The client confirms (in-app only).
  insert into public.job_notifications (job_id, recipient_id, kind, body)
  values (p_job, j.homeowner_id, 'arrival', '¿Llegó el profesional para tu trabajo?')
  on conflict (job_id, kind) do nothing;
end;
$$;

-- 4. Scheduler. Creates due check-ins; never sends outside 08:00-19:59 Santo Domingo time. -----
create or replace function public.run_job_checkins()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_local timestamp := v_now at time zone 'America/Santo_Domingo';
  v_count integer := 0;
  r record;
  v_mid timestamptz;
begin
  -- Only during reasonable hours in the client's and the business's time zone (Santo Domingo).
  if extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    return 0;
  end if;

  for r in
    select j.id, j.homeowner_id, j.status, j.started_at, q.window_start, q.window_end
      from public.jobs j
      join public.quotes q on q.id = j.approved_quote_id
     where j.status in ('accepted', 'in_progress')
       and q.window_start is not null and q.window_end is not null
  loop
    -- Arrival, fallback: the window started and no start was recorded.
    if r.status = 'accepted' and r.window_start <= v_now then
      -- handled below in the same loop via the 'arrival' insert
      insert into public.job_notifications (job_id, recipient_id, kind, body)
      select r.id, r.homeowner_id, 'arrival', '¿Llegó el profesional para tu trabajo?'
       where not exists (select 1 from public.job_notifications n where n.job_id = r.id and n.kind = 'arrival')
         and not exists (
           select 1 from public.job_notifications n
            where n.recipient_id = r.homeowner_id
              and (n.created_at at time zone 'America/Santo_Domingo')::date = v_local::date
         )
      on conflict (job_id, kind) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;

    if r.status = 'in_progress' and r.started_at is not null then
      v_mid := r.window_start + (r.window_end - r.window_start) / 2;

      -- Mid-job: halfway through the quoted window, and only while the window is still open.
      -- Once the window has ended, the overrun check replaces it.
      if v_now >= v_mid and v_now <= r.window_end then
        insert into public.job_notifications (job_id, recipient_id, kind, body)
        select r.id, r.homeowner_id, 'midjob', '¿Cómo va el trabajo?'
         where not exists (
           select 1 from public.job_notifications n
            where n.recipient_id = r.homeowner_id
              and (n.created_at at time zone 'America/Santo_Domingo')::date = v_local::date
         )
        on conflict (job_id, kind) do nothing;
        if found then v_count := v_count + 1; end if;
      end if;

      -- Overrun: the quoted window has ended and the job is still open.
      -- Not limited by the one-per-day cap: it is the safety net, so it is never delayed a day.
      -- Still at most one per job, by unique (job_id, kind).
      if v_now > r.window_end then
        insert into public.job_notifications (job_id, recipient_id, kind, body)
        select r.id, r.homeowner_id, 'overrun',
               'Tu trabajo debía terminar a las ' ||
               to_char(r.window_end at time zone 'America/Santo_Domingo', 'HH12:MI AM') || '. ¿Sigue en curso?'
        on conflict (job_id, kind) do nothing;
        if found then v_count := v_count + 1; end if;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.run_job_checkins() from public, anon, authenticated;

-- Schedule: see supabase/ops/job_checkins_setup.sql (run once after this migration).
