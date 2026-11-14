-- Listavy: demo (showcase) pros. Schema only. Data conversion is in 0059.
-- A demo pro is visible by direct link, never in search or boosts, and cannot receive a job request.
-- Only an admin can set is_demo. Money tables are not touched.

-- 1. Flag.
alter table public.pros add column if not exists is_demo boolean not null default false;

create or replace function public.pros_is_demo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el perfil de demostración.';
  end if;
  return new;
end;
$$;

drop trigger if exists pros_is_demo_guard on public.pros;
create trigger pros_is_demo_guard before update of is_demo on public.pros
  for each row execute function public.pros_is_demo_guard();

-- 2. Search: exclude demo pros unless the caller asks for that exact pro (profile page).
--    Return type changes (is_demo added), so the function is dropped and recreated.
drop function if exists public.list_pro_cards(text, text, uuid, text);
create function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo')
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean, is_demo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, pr.full_name, p.trade, p.zone, p.price_min_dop, p.price_max_dop, p.plan, p.verified_at,
         (select f.storage_path from public.pro_files f
           where f.pro_id = p.id and f.kind = 'avatar' and f.review_status = 'approved'
           order by f.created_at desc limit 1) as avatar_path,
         p.bio,
         (p.verified_at is not null) as identity_verified,
         (pr.email_verified_at is not null) as email_verified,
         (pr.phone is not null) as phone_verified,
         p.available,
         p.is_demo
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.city = p_city
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
    and (not p.is_demo or p_pro_id is not null)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke execute on function public.list_pro_cards(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.list_pro_cards(text, text, uuid, text) to anon, authenticated, service_role;

-- 3. Boosts: a demo pro never gets a boost placement.
create or replace function public.boosted_pro_ids(p_trade text default null, p_zone text default null,
                                                  p_city text default 'santo_domingo')
returns table(pro_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.pro_id, b.starts_at
    from public.boosts b
    join public.pros p on p.id = b.pro_id
   where b.status = 'active'
     and b.ends_at > now()
     and p.verification_status = 'approved'
     and p.suspended_at is null
     and not p.is_demo
     and p.city = p_city
     and (p_trade is null or p.trade = p_trade)
     and (p_zone is null or p.zone = p_zone)
   order by b.starts_at desc
   limit 3;
$$;

grant execute on function public.boosted_pro_ids(text, text, text) to anon, authenticated, service_role;

-- 4. Job requests: refuse a demo pro. Otherwise the 0055 body is unchanged.
create or replace function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text, p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text)
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
    select p.available, p.city, p.is_demo into v_available, v_pro_city, v_is_demo from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
    -- Demo gate (0058): a demonstration profile never receives a request, even when called directly.
    if v_is_demo then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Availability gate (UI phase §7, item 6): an unavailable pro gets no requests, even when the client calls this directly.
    if not v_available then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- City gate (Phase 2): the pro must serve the city of the job's zone. Same pattern as the availability gate.
    if v_pro_city is distinct from public.city_of_zone(p_zone) then
      raise exception 'El profesional elegido no atiende en esta ciudad. Elige otro.';
    end if;
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
$function$;

-- 5. Demo reviews: a separate table, so they never enter reviews, the real average, or the ledger.
create table if not exists public.demo_reviews (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pros (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  quality integer check (quality is null or quality between 1 and 5),
  punctuality integer check (punctuality is null or punctuality between 1 and 5),
  cleanliness integer check (cleanliness is null or cleanliness between 1 and 5),
  comment text not null check (char_length(comment) <= 500),
  reviewer_label text not null default 'Cliente de demostración',
  created_at timestamptz not null default now()
);

alter table public.demo_reviews enable row level security;

create or replace function public.is_demo_pro(p_pro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pros p where p.id = p_pro and p.is_demo);
$$;

drop policy if exists demo_reviews_select on public.demo_reviews;
create policy demo_reviews_select on public.demo_reviews for select
  using (public.is_demo_pro(pro_id));

drop policy if exists demo_reviews_admin on public.demo_reviews;
create policy demo_reviews_admin on public.demo_reviews for all
  using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.demo_reviews from authenticated, anon;
grant select on public.demo_reviews to anon, authenticated;
