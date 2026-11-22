-- 0116: fixed-price instant booking (Item 16).
-- A client picks a fixed service and an opted-in pro. The database creates a normal repair job and one
-- quote at the catalog price, then approves it through approve_quote (the same guards as any quote).
-- The client then pays on the existing PaySheet. No second payment flow.
-- Catalog ships EMPTY. Fabian creates services and prices in /admin.
-- NOT APPLIED. Sam reviews, then Fabian approves.

-- 1. fixed_services: the catalog ---------------------------------------------
create table public.fixed_services (
  id           uuid primary key default gen_random_uuid(),
  trade        text not null references public.trades (key),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  name_es      text not null check (char_length(btrim(name_es)) between 3 and 80),
  -- The scope. The fixed price covers exactly this text.
  includes_es  text not null check (char_length(btrim(includes_es)) between 10 and 600),
  price_dop    integer not null check (price_dop > 0),
  active       boolean not null default true,
  sort_order   integer not null default 1000,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.fixed_services enable row level security;

-- Public reads active services. Admins also read inactive ones (the /admin manager).
drop policy if exists fixed_services_read on public.fixed_services;
create policy fixed_services_read on public.fixed_services
  for select using (active or public.is_admin());

revoke insert, update, delete on public.fixed_services from anon, authenticated;
grant select on public.fixed_services to anon, authenticated;

-- 2. pro_fixed_services: a pro's opt-in set ----------------------------------
create table public.pro_fixed_services (
  pro_id           uuid not null references public.pros (id) on delete cascade,
  fixed_service_id uuid not null references public.fixed_services (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (pro_id, fixed_service_id)
);

alter table public.pro_fixed_services enable row level security;

-- Owner reads own rows. Public reads go through list_pro_fixed_services (filters active, approved, not demo).
drop policy if exists pro_fixed_services_owner_read on public.pro_fixed_services;
create policy pro_fixed_services_owner_read on public.pro_fixed_services
  for select using (pro_id = (select auth.uid()));

revoke all on public.pro_fixed_services from anon, authenticated;
grant select on public.pro_fixed_services to authenticated;

-- 3. jobs.fixed_service_id: marks a fixed booking -----------------------------
alter table public.jobs add column if not exists fixed_service_id uuid references public.fixed_services (id);
create index if not exists jobs_fixed_service_idx on public.jobs (fixed_service_id) where fixed_service_id is not null;

-- 4. Notifications: a fixed booking's quote is not a client-sent quote ------
-- The client created it, so the homeowner gets no "quote received". The pro gets the invitation
-- (request_invite) at creation and the existing "quote accepted" notice, which is the booked notice.
-- notify_on_quote_accepted is unchanged. Body is the 0091 version plus the fixed-job skip.
create or replace function public.notify_on_quote_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ho uuid; v_trade text; v_zone text;
begin
  if new.revision_of is not null then return new; end if;
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.fixed_service_id is not null) then return new; end if;
  select j.homeowner_id, j.trade, j.zone into v_ho, v_trade, v_zone from public.jobs j where j.id = new.job_id;
  perform public.notify_user_push(v_ho, 'job_quote_received', 'Recibiste una cotización',
    'Revisa el precio y el alcance antes de decidir.', '/trabajos/' || new.job_id, false);
  perform public.notify_user_email(v_ho, 'job_quote_received',
    jsonb_build_object('job_id', new.job_id, 'trade', v_trade, 'zone', v_zone, 'amount_dop', new.amount_dop), false, true);
  return new;
end; $$;

-- 5. admin_upsert_fixed_service: super admin, AAL2 (is_admin), reason, admin_log --------
create or replace function public.admin_upsert_fixed_service(
  p_id          uuid,
  p_trade       text,
  p_slug        text,
  p_name_es     text,
  p_includes_es text,
  p_price_dop   integer,
  p_active      boolean,
  p_sort_order  integer,
  p_reason      text)
returns public.fixed_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.fixed_services;
  v_old public.fixed_services;
begin
  if (select auth.uid()) is null or not public.is_admin() or not public.is_super_admin() then
    raise exception 'Solo un super administrador puede editar los servicios a precio fijo.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  if p_price_dop is null or p_price_dop <= 0 then
    raise exception 'El precio debe ser mayor que cero.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.trades t where t.key = p_trade and t.active) then
    raise exception 'Oficio no válido.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.fixed_services (trade, slug, name_es, includes_es, price_dop, active, sort_order, created_by)
      values (p_trade, p_slug, trim(p_name_es), trim(p_includes_es), p_price_dop, coalesce(p_active, true),
              coalesce(p_sort_order, 1000), (select auth.uid()))
      returning * into v_row;
    perform public.admin_log('fixed_service_created', v_row.id,
      jsonb_build_object('name_es', v_row.name_es, 'price_dop', v_row.price_dop, 'trade', v_row.trade,
                         'reason', trim(p_reason)));
  else
    select * into v_old from public.fixed_services where id = p_id for update;
    if not found then raise exception 'Servicio no encontrado.' using errcode = 'P0002'; end if;
    update public.fixed_services set
      trade = p_trade, slug = p_slug, name_es = trim(p_name_es), includes_es = trim(p_includes_es),
      price_dop = p_price_dop, active = coalesce(p_active, active), sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id
    returning * into v_row;
    perform public.admin_log('fixed_service_updated', v_row.id,
      jsonb_build_object('old_price_dop', v_old.price_dop, 'new_price_dop', v_row.price_dop,
                         'old_active', v_old.active, 'new_active', v_row.active, 'reason', trim(p_reason)));
  end if;
  return v_row;
end;
$$;

revoke all on function public.admin_upsert_fixed_service(uuid, text, text, text, text, integer, boolean, integer, text) from public, anon;
grant execute on function public.admin_upsert_fixed_service(uuid, text, text, text, text, integer, boolean, integer, text) to authenticated;

-- 6. pro_set_fixed_services: the pro replaces their opt-in set --------------------
create or replace function public.pro_set_fixed_services(p_service_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trade text;
  v_clean uuid[];
begin
  if v_uid is null then raise exception 'Debes entrar primero.' using errcode = '42501'; end if;
  select p.trade into v_trade from public.pros p where p.id = v_uid;
  if not found then raise exception 'No tienes una solicitud de profesional.' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_clean
    from unnest(coalesce(p_service_ids, '{}')) as x
    where x is not null;
  if cardinality(v_clean) > 30 then
    raise exception 'Elige hasta 30 servicios.' using errcode = '22023';
  end if;
  -- Every chosen service must exist, be active, and belong to the pro's trade.
  if exists (
    select 1 from unnest(v_clean) as c
    where not exists (select 1 from public.fixed_services fs
                       where fs.id = c and fs.active and fs.trade = v_trade)
  ) then
    raise exception 'Un servicio elegido no existe, está inactivo o no es de tu oficio.' using errcode = '22023';
  end if;

  delete from public.pro_fixed_services where pro_id = v_uid and not (fixed_service_id = any (v_clean));
  insert into public.pro_fixed_services (pro_id, fixed_service_id)
    select v_uid, c from unnest(v_clean) as c
    on conflict do nothing;
end;
$$;

revoke all on function public.pro_set_fixed_services(uuid[]) from public, anon;
grant execute on function public.pro_set_fixed_services(uuid[]) to authenticated;

-- 7. list_pro_fixed_services: a pro's public fixed services ----------------------
create or replace function public.list_pro_fixed_services(p_pro uuid)
returns table (id uuid, trade text, slug text, name_es text, includes_es text, price_dop integer)
language sql
stable
security definer
set search_path = ''
as $$
  select fs.id, fs.trade, fs.slug, fs.name_es, fs.includes_es, fs.price_dop
  from public.pro_fixed_services pfs
  join public.fixed_services fs on fs.id = pfs.fixed_service_id
  join public.pros p on p.id = pfs.pro_id
  where pfs.pro_id = p_pro
    and fs.active
    and fs.trade = p.trade
    and p.verification_status = 'approved'
    and p.closed_at is null
    and p.is_demo = false
  order by fs.sort_order, fs.name_es;
$$;

revoke all on function public.list_pro_fixed_services(uuid) from public;
grant execute on function public.list_pro_fixed_services(uuid) to anon, authenticated;

-- 8. create_fixed_booking --------------------------------------------------------
-- Same gates as create_job_request (open caps, scheduling pair, municipality, self-hire, demo, availability).
-- Extra gates: the service is active; the pro is opted into it and in its trade.
-- Money path: the job is created 'requested', one quote is inserted for the pro at the catalog price
-- ('invited' first, so the pro gets the usual invitation), moved to 'sent' with a 48-hour validity,
-- then approved by calling approve_quote. approve_quote runs its own guards (homeowner, job status,
-- quote status, validity) and books the job. The client then pays on the normal PaySheet.
create or replace function public.create_fixed_booking(
  p_service_id uuid,
  p_pro_id uuid,
  p_zone text,
  p_description text,
  p_scheduled_date date default null,
  p_scheduled_window text default null,
  p_municipality_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_svc public.fixed_services;
  v_pro record;
  v_job uuid;
  v_quote uuid;
  v_mun uuid;
  v_open integer;
  v_unbooked integer;
  v_last_booking timestamptz;
  v_block_from timestamptz;
  v_desc text;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;

  -- Self-hire guard, as in create_job_request.
  if p_pro_id = v_uid then
    raise exception 'No puedes contratarte a ti mismo. Elige otro profesional.';
  end if;

  select * into v_svc from public.fixed_services where id = p_service_id;
  if not found or not v_svc.active then
    raise exception 'Ese servicio no está disponible.' using errcode = '22023';
  end if;

  select p.trade, p.pro_type, p.available, p.is_demo, p.closed_at, p.verification_status
    into v_pro
    from public.pros p where p.id = p_pro_id;
  if not found or v_pro.verification_status <> 'approved' or v_pro.closed_at is not null then
    raise exception 'Un profesional elegido no está disponible para este oficio.';
  end if;
  -- Demo gate (0058) and availability gate (UI phase 6), as in create_job_request.
  if v_pro.is_demo or not v_pro.available then
    raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.';
  end if;

  -- The pro's opt-in is their standing acceptance of the catalog price for this service.
  if v_pro.trade <> v_svc.trade
     or not exists (select 1 from public.pro_fixed_services pfs
                     where pfs.pro_id = p_pro_id and pfs.fixed_service_id = p_service_id) then
    raise exception 'Ese profesional no ofrece este servicio a precio fijo. Elige otro.' using errcode = '22023';
  end if;

  -- Schedule: identical rules to create_job_request (0090). NULL, NULL means "Lo antes posible".
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

  -- Open-request caps: identical to create_job_request.
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

  -- Place: identical to create_job_request (0111).
  v_mun := coalesce(p_municipality_id, (select m.id from public.municipalities m where m.legacy_city = public.city_of_zone(p_zone)));
  if v_mun is null then raise exception 'Elige el municipio donde necesitas el servicio.' using errcode = '22023'; end if;

  v_desc := coalesce(nullif(btrim(coalesce(p_description, '')), ''), v_svc.name_es);

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, requested_pro_type,
                           scheduled_date, scheduled_window, municipality_id, fixed_service_id)
  values (v_uid, v_svc.trade, p_zone, v_desc, 'requested', 'repair', v_pro.pro_type,
          p_scheduled_date, p_scheduled_window, v_mun, p_service_id)
  returning id into v_job;

  -- The money path: one quote at the catalog price, through approve_quote.
  insert into public.quotes (job_id, pro_id, status, invited_at, amount_dop)
    values (v_job, p_pro_id, 'invited', now(), v_svc.price_dop)
    returning id into v_quote;
  update public.quotes set status = 'sent', valid_until = now() + interval '48 hours' where id = v_quote;
  perform public.approve_quote(v_quote);

  return v_job;
end;
$$;

revoke all on function public.create_fixed_booking(uuid, uuid, text, text, date, text, uuid) from public, anon;
grant execute on function public.create_fixed_booking(uuid, uuid, text, text, date, text, uuid) to authenticated;
