-- 0119 B2B properties (Item 17). Property managers and Airbnb hosts post jobs for their rentals.
--
-- Readings (Sam, 2026-11-22; Fabian relayed):
--   1. Standard commission. No host subscription in v1. No new billing here.
--   2. No minimum scale. Properties are a client-account capability, not a gated tier.
--   3. Properties belong to the client (demand) side. No RNC or business verification for hosts.
--      The optional business_name sits ON THE PROPERTY (nullable), so a host with several rentals can
--      name each one. Design call, stated in the PR.
--   4. Priority = the urgent lane (0117). No separate SLA or priority machinery.
--   5. Access notes are sensitive. The owner always reads them. A pro reads them only on a job that is
--      booked (booked_at set) AND paid (payment_status = 'paid'). The data layer enforces it in
--      job_property_view. The properties table itself is owner-only, so a pro never reads it directly.
--   6. The monthly statement is a resumen, not a comprobante fiscal. Headed that way in the app.
--
-- Design call: municipality conflict. create_job_request refuses a request whose p_municipality_id differs
-- from the property's municipality. No silent override. A null municipality takes the property's.
-- create_recurring_booking takes the series place from the property when one is chosen.
--
-- Statement definition: a job belongs to the month it was created (Santo Domingo time). Cancelled jobs are
-- excluded. Paid = sum of job and diagnostic payments that are held or released, minus succeeded refunds.

-- 1. Properties. Owner-only. No hard delete: a property is archived, because jobs reference it.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 3 and 80),
  municipality_id uuid not null references public.municipalities (id),
  address_detail text check (address_detail is null or char_length(address_detail) <= 200),
  access_notes text check (access_notes is null or char_length(access_notes) <= 500),
  business_name text check (business_name is null or char_length(business_name) <= 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists properties_owner_idx on public.properties (owner_id);

alter table public.properties enable row level security;
drop policy if exists properties_owner_select on public.properties;
create policy properties_owner_select on public.properties for select
  using (owner_id = (select auth.uid()));
drop policy if exists properties_owner_insert on public.properties;
create policy properties_owner_insert on public.properties for insert
  with check (owner_id = (select auth.uid()));
drop policy if exists properties_owner_update on public.properties;
create policy properties_owner_update on public.properties for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.properties from public, anon, authenticated;
grant select, insert, update on public.properties to authenticated;

create or replace function public.properties_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.properties_touch() from public, anon, authenticated;
drop trigger if exists properties_touch on public.properties;
create trigger properties_touch before update on public.properties
  for each row execute function public.properties_touch();

-- 2. Job and series columns. Set at creation only (the same insert-only rule as the urgent flag).
alter table public.jobs add column if not exists property_id uuid references public.properties (id);
create index if not exists jobs_property_idx on public.jobs (property_id) where property_id is not null;
alter table public.recurring_bookings add column if not exists property_id uuid references public.properties (id);

create or replace function public.jobs_guard_property()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.property_id is distinct from old.property_id then
    raise exception 'La propiedad del trabajo se fija al crearlo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.jobs_guard_property() from public, anon, authenticated;
drop trigger if exists jobs_guard_property on public.jobs;
create trigger jobs_guard_property before update of property_id on public.jobs
  for each row execute function public.jobs_guard_property();

-- 3. Property reveal for a job. Owner: everything. Booked pro: name and address. Access notes only when paid.
create or replace function public.job_property_view(p_job uuid)
returns table (
  property_id uuid,
  property_name text,
  municipality_name text,
  address_detail text,
  business_name text,
  access_notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j record;
  v_uid uuid := (select auth.uid());
  v_owner boolean;
  v_pro_booked boolean;
begin
  if v_uid is null then return; end if;
  select * into j from public.jobs where id = p_job;
  if not found or j.property_id is null then return; end if;
  v_owner := j.homeowner_id = v_uid;
  v_pro_booked := j.pro_id = v_uid and j.booked_at is not null;
  if not v_owner and not v_pro_booked then return; end if;

  return query
    select pr.id, pr.name, m.display_name, pr.address_detail, pr.business_name,
           case when v_owner or j.payment_status = 'paid' then pr.access_notes end
      from public.properties pr
      join public.municipalities m on m.id = pr.municipality_id
     where pr.id = j.property_id;
end;
$$;
revoke all on function public.job_property_view(uuid) from public, anon;
grant execute on function public.job_property_view(uuid) to authenticated;

-- 4. Monthly statement for the caller. Owner-only by construction (auth.uid()).
create or replace function public.client_monthly_statement(p_year integer, p_month integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_start timestamptz;
  v_end timestamptz;
  v_groups jsonb;
  v_jobs integer;
  v_paid integer;
begin
  if v_uid is null then raise exception 'Debes entrar primero.' using errcode = '42501'; end if;
  if p_year is null or p_year not between 2020 and 2100 or p_month is null or p_month not between 1 and 12 then
    raise exception 'Mes no válido.' using errcode = '22023';
  end if;
  v_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'America/Santo_Domingo');
  v_end := v_start + make_interval(months => 1);

  with jm as (
    select j.id, j.property_id
      from public.jobs j
     where j.homeowner_id = v_uid
       and j.status <> 'cancelled'
       and j.created_at >= v_start and j.created_at < v_end
  ),
  paid as (
    select pm.job_id,
           sum(pm.amount_dop - coalesce(rf.refunded, 0)) as paid_dop
      from public.payments pm
      join jm on jm.id = pm.job_id
      left join lateral (
        select sum(r.amount_dop) as refunded
          from public.refunds r
         where r.payment_id = pm.id and r.status = 'succeeded'
      ) rf on true
     where pm.purpose in ('job', 'diagnostic')
       and pm.status in ('held', 'released')
     group by pm.job_id
  ),
  grp as (
    select jm.property_id,
           count(*)::int as job_count,
           coalesce(sum(paid.paid_dop), 0)::int as paid_dop
      from jm
      left join paid on paid.job_id = jm.id
     group by jm.property_id
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('property_id', g.property_id, 'name', pr.name,
                              'job_count', g.job_count, 'paid_dop', g.paid_dop)
           order by pr.name nulls last), '[]'::jsonb)
    into v_groups
    from grp g
    left join public.properties pr on pr.id = g.property_id;

  select coalesce(sum((g->>'job_count')::int), 0), coalesce(sum((g->>'paid_dop')::int), 0)
    into v_jobs, v_paid
    from jsonb_array_elements(v_groups) g;

  return jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'groups', v_groups,
    'total_jobs', v_jobs,
    'total_paid_dop', v_paid
  );
end;
$$;
revoke all on function public.client_monthly_statement(integer, integer) from public, anon;
grant execute on function public.client_monthly_statement(integer, integer) to authenticated;

-- 5. Redefined functions. Old signatures are dropped, so the new ones are granted again here.
drop function if exists public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid, boolean);

create or replace function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text,
                                          p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text,
                                          p_requested_pro_type text default 'any',
                                          p_scheduled_date date default null,
                                          p_scheduled_window text default null,
                                          p_municipality_id uuid default null,
                                          p_urgent boolean default false,
                                          p_property_id uuid default null)
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
  v_mun uuid;
  v_is_demo boolean;
  v_pro_type text;
  v_urgent boolean := coalesce(p_urgent, false);
  v_fee integer;
  v_prop record;
  v_prop_mun uuid;
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

  -- Urgent (0117). Today only: ASAP, or today's date. A future date is refused.
  if v_urgent then
    if p_scheduled_date is not null and p_scheduled_date <> public.santo_domingo_today() then
      raise exception 'Lo urgente es para hoy. Cambia la fecha a hoy o quita la urgencia.' using errcode = '22023';
    end if;
    v_fee := public.urgent_fee_setting();
    if v_fee is null or v_fee <= 0 then
      raise exception 'La tarifa urgente no está configurada.' using errcode = '22023';
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
    select p.available, p.is_demo, p.pro_type into v_available, v_is_demo, v_pro_type
      from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
    -- Demo gate (0058): a demonstration profile never receives a request, even when called directly.
    if v_is_demo then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Availability gate (UI phase §7, item 6). Availability is the master switch for urgent work too.
    if not v_available then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Type gate (person vs company, Phase 1). 'any' accepts both.
    if p_requested_pro_type <> 'any' and v_pro_type is distinct from p_requested_pro_type then
      raise exception 'Un profesional elegido no coincide con el tipo que pediste (persona o empresa). Elige otro.';
    end if;
  end loop;

  -- Property (0119). The property must be the caller's and active. Its municipality is the job's place.
  -- If the client also sent a different municipality, the request is refused (no silent override).
  if p_property_id is not null then
    select pr.owner_id, pr.municipality_id, pr.archived_at into v_prop
      from public.properties pr where pr.id = p_property_id;
    if not found or v_prop.owner_id is distinct from v_uid then
      raise exception 'No encontramos esa propiedad.' using errcode = '42501';
    end if;
    if v_prop.archived_at is not null then
      raise exception 'Esa propiedad está archivada. Elige otra o ninguna.' using errcode = '22023';
    end if;
    if p_municipality_id is not null and p_municipality_id <> v_prop.municipality_id then
      raise exception 'La propiedad está en otro municipio. Quita el municipio o elige la propiedad correcta.' using errcode = '22023';
    end if;
    v_prop_mun := v_prop.municipality_id;
  end if;

  -- Place (0111): the job's municipality. Older clients without one fall back to the legacy market of the zone.
  v_mun := coalesce(v_prop_mun, p_municipality_id, (select m.id from public.municipalities m where m.legacy_city = public.city_of_zone(p_zone)));
  if v_mun is null then raise exception 'Elige el municipio donde necesitas el servicio.' using errcode = '22023'; end if;

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path, requested_pro_type,
                           scheduled_date, scheduled_window, municipality_id, urgent, urgent_fee_dop, property_id)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path, p_requested_pro_type,
          p_scheduled_date, p_scheduled_window, v_mun, v_urgent, case when v_urgent then v_fee else null end, p_property_id)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$function$;
create or replace function public.create_recurring_booking(p_source_job uuid, p_frequency text, p_anchor integer, p_window text,
                                                           p_property_id uuid default null)
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
  v_prop record;
  v_mun uuid;
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

  -- Property (0119). The series place comes from the property when one is chosen; otherwise the source job's.
  if p_property_id is not null then
    select pr.owner_id, pr.municipality_id, pr.archived_at into v_prop
      from public.properties pr where pr.id = p_property_id;
    if not found or v_prop.owner_id is distinct from v_uid then
      raise exception 'No encontramos esa propiedad.' using errcode = '42501';
    end if;
    if v_prop.archived_at is not null then
      raise exception 'Esa propiedad está archivada. Elige otra o ninguna.' using errcode = '22023';
    end if;
    v_mun := v_prop.municipality_id;
  else
    v_mun := j.municipality_id;
  end if;

  insert into public.recurring_bookings (client_id, pro_id, source_job_id, trade, zone, job_type, description,
                                         frequency, anchor, scheduled_window, next_due_date, municipality_id, property_id)
  values (v_uid, j.pro_id, j.id, j.trade, j.zone, j.job_type, btrim(j.description),
          p_frequency, p_anchor, p_window,
          public.recurring_first_due(p_frequency, p_anchor, public.santo_domingo_today()), v_mun, p_property_id)
  returning id into v_id;

  return v_id;
end;
$$;
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
                      and p.available and p.trade = r.trade)
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
                             scheduled_date, scheduled_window, municipality_id, property_id)
    values (r.client_id, r.trade, r.zone, r.description, 'requested', r.job_type, 'any',
            r.next_due_date, r.scheduled_window, r.municipality_id, r.property_id)
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
revoke execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid, boolean, uuid) from public, anon;
grant execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid, boolean, uuid) to authenticated;

drop function if exists public.create_recurring_booking(uuid, text, integer, text);
revoke execute on function public.create_recurring_booking(uuid, text, integer, text, uuid) from public, anon;
grant execute on function public.create_recurring_booking(uuid, text, integer, text, uuid) to authenticated;
