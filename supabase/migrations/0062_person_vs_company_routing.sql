-- 0062 Person vs company, Phase 1: type routing and the public company name.
-- Not applied. Sam reviews on the preview, Fabian approves the apply.
--
-- Phase 0 (RNC single-transaction write) is already in place: create_pro_application (0008)
-- writes the pro row, the company row and the file rows inside one function call.
-- No change here.

-- 1. Job type requested by the client on /pedir. 'any' keeps the old behaviour.
alter table public.jobs add column if not exists requested_pro_type text not null default 'any'
  check (requested_pro_type in ('individual', 'company', 'any'));

-- 2. list_pro_cards: optional type filter. Returns the type and the public razón social
--    (companies only). The RNC is never returned.
drop function if exists public.list_pro_cards(text, text, uuid, text);

create function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo',
                                      p_pro_type text default null)
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean, is_demo boolean,
              pro_type text, razon_social text)
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
         p.is_demo,
         p.pro_type,
         case when p.pro_type = 'company'
              then (select c.razon_social from public.pro_companies c where c.pro_id = p.id)
         end as razon_social
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.city = p_city
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
    and (p_pro_type is null or p_pro_type = 'any' or p.pro_type = p_pro_type)
    and (not p.is_demo or p_pro_id is not null)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke execute on function public.list_pro_cards(text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.list_pro_cards(text, text, uuid, text, text) to anon, authenticated, service_role;

-- 3. create_job_request: the client's type choice. Server enforcement: a pro whose type
--    does not match is refused, even when the client calls this directly.
--    Body is 0058's body plus the type check and the stored choice.
drop function if exists public.create_job_request(text, text, text, text, uuid[], text[], text);

create function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text,
                                          p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text,
                                          p_requested_pro_type text default 'any')
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

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path, requested_pro_type)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path, p_requested_pro_type)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$function$;

-- 4. Grants: same lock-down as 0011. The drop above removed the old grants, so restore them.
revoke execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text) from public, anon;
grant execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text) to authenticated;
