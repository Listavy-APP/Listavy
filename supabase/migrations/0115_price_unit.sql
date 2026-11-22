-- 0115: price unit on pros (Item 14). Reference range only: 'job' | 'hour' | 'visit'.
-- Advertising and reference only. No billing, time tracking, commission or checkout changes.
-- Column privileges: the pro reads price_unit on their own row; no UPDATE grant. Writes only through
-- pro_update_pricing_zone and create_pro_application (both definer, both set listavy.pro_internal or validate).
-- Aggregates: get_price_guides and the home minimum count 'job' pros only.
-- NOT APPLIED. Sam reviews, then Fabian approves.

-- 1. Column ----------------------------------------------------------------
alter table public.pros add column if not exists price_unit text not null default 'job';
alter table public.pros drop constraint if exists pros_price_unit_check;
alter table public.pros add constraint pros_price_unit_check check (price_unit in ('job', 'hour', 'visit'));

-- The pro's own row (OWN_PRO_COLUMNS) reads this column directly. Public readers use list_pro_cards.
grant select (price_unit) on public.pros to authenticated;

-- 2. Guard (0111 copy plus price_unit in the price and zone block) -----------
create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       and not (old.verification_status = 'rejected' and new.verification_status = 'pending' and old.closed_at is null) then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan
       or new.plan_stripe_subscription_id is distinct from old.plan_stripe_subscription_id
       or new.plan_current_period_end is distinct from old.plan_current_period_end
       or new.plan_activated_at is distinct from old.plan_activated_at
       or new.closed_at is distinct from old.closed_at
       or new.suspended_at is distinct from old.suspended_at
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.trade is distinct from old.trade
       or (new.city is distinct from old.city and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on')
       or new.pro_type is distinct from old.pro_type then
      raise exception 'Solo un administrador puede cambiar estos datos.';
    end if;
    -- Price and zone: owner writes only through pro_update_pricing_zone, which sets the flag.
    if (new.zone is distinct from old.zone
        or new.price_min_dop is distinct from old.price_min_dop
        or new.price_max_dop is distinct from old.price_max_dop
        or new.price_unit is distinct from old.price_unit)
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'Solo un administrador puede cambiar estos datos.';
    end if;
    if new.municipality_id is distinct from old.municipality_id
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'Solo puedes cambiar tu municipio desde tu perfil.';
    end if;
    if new.rejection_reason is distinct from old.rejection_reason
       and not (new.verification_status = 'pending' and new.rejection_reason is null) then
      raise exception 'Solo un administrador puede registrar el motivo.';
    end if;
    if new.pro_free_until is distinct from old.pro_free_until
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'El mes gratis lo asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;

-- 3. create_pro_application: 15 args. The unit is validated and stored; default 'job'.
drop function if exists public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text, uuid);
create or replace function public.create_pro_application(
  p_full_name    text,
  p_trade        text,
  p_zone         text,
  p_price_min    integer,
  p_price_max    integer,
  p_pro_type     text,
  p_id_path      text,
  p_work_paths   text[],
  p_company_path text,
  p_razon_social text,
  p_rnc          text,
  p_avatar_path  text default null,
  p_custom_line  text default null,
  p_municipality_id uuid default null,
  p_price_unit   text default 'job'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  work_path text;
  v_line text := nullif(trim(coalesce(p_custom_line, '')), '');
  v_mun uuid;
begin
  if uid is null then
    raise exception 'Debes entrar primero.';
  end if;
  if p_pro_type not in ('individual', 'company') then
    raise exception 'Tipo de profesional no válido.';
  end if;
  if p_price_unit not in ('job', 'hour', 'visit') then
    raise exception 'Unidad de precio no válida.' using errcode = '22023';
  end if;
  if p_work_paths is null or cardinality(p_work_paths) not between 1 and 3 then
    raise exception 'Sube entre 1 y 3 fotos de trabajos.';
  end if;
  if p_pro_type = 'company' and (p_company_path is null or p_razon_social is null or p_rnc is null) then
    raise exception 'Faltan los datos de la empresa.';
  end if;
  if p_pro_type = 'individual' and (p_company_path is not null or p_razon_social is not null or p_rnc is not null) then
    raise exception 'Los profesionales físicos no envían datos de empresa.';
  end if;
  if v_line is not null and p_pro_type <> 'company' then
    raise exception 'Solo las empresas pueden escribir su giro.' using errcode = '22023';
  end if;
  if p_avatar_path is not null and split_part(p_avatar_path, '/', 1) <> uid::text then
    raise exception 'La foto de perfil debe estar en tu carpeta.';
  end if;

  -- Place (0111): the pro's municipality. Older callers fall back to the legacy market of the zone.
  v_mun := coalesce(p_municipality_id, (select m.id from public.municipalities m where m.legacy_city = public.city_of_zone(p_zone)));
  if v_mun is null then raise exception 'Elige tu municipio.' using errcode = '22023'; end if;

  update public.profiles set full_name = p_full_name where id = uid;

  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, pro_type, custom_line, municipality_id, price_unit)
    values (uid, p_trade, p_zone, p_price_min, p_price_max, p_pro_type, v_line, v_mun, p_price_unit);

  if p_pro_type = 'company' then
    insert into public.pro_companies (pro_id, razon_social, rnc)
      values (uid, p_razon_social, p_rnc);
  end if;

  insert into public.pro_files (pro_id, kind, storage_path)
    values (uid, 'id_document', p_id_path);
  foreach work_path in array p_work_paths loop
    insert into public.pro_files (pro_id, kind, storage_path)
      values (uid, 'work_photo', work_path);
  end loop;
  if p_pro_type = 'company' then
    insert into public.pro_files (pro_id, kind, storage_path)
      values (uid, 'company_document', p_company_path);
  end if;
  if p_avatar_path is not null then
    insert into public.pro_files (pro_id, kind, storage_path)
      values (uid, 'avatar', p_avatar_path);
  end if;
end;
$$;

revoke execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text, uuid, text) to authenticated;

-- 4. pro_update_pricing_zone: 5 args. Null unit keeps the current one.
drop function if exists public.pro_update_pricing_zone(integer, integer, text, uuid);
create or replace function public.pro_update_pricing_zone(p_price_min integer, p_price_max integer, p_zone text,
                                                          p_municipality_id uuid default null,
                                                          p_price_unit text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inicia sesión para editar tu perfil.' using errcode = '42501';
  end if;
  if p_price_min is null or p_price_max is null or p_price_min < 0 or p_price_max < p_price_min then
    raise exception 'Rango de precios no válido.' using errcode = '22023';
  end if;
  -- Sector is free text (0111). Only its length is checked here.
  if p_zone is null or char_length(btrim(p_zone)) not between 2 and 60 then
    raise exception 'Escribe tu sector (entre 2 y 60 caracteres).' using errcode = '22023';
  end if;
  if p_municipality_id is not null and not exists (select 1 from public.municipalities where id = p_municipality_id) then
    raise exception 'Municipio no válido.' using errcode = '22023';
  end if;
  if p_price_unit is not null and p_price_unit not in ('job', 'hour', 'visit') then
    raise exception 'Unidad de precio no válida.' using errcode = '22023';
  end if;

  perform set_config('listavy.pro_internal', 'on', true);
  update public.pros
     set price_min_dop = p_price_min,
         price_max_dop = p_price_max,
         zone = btrim(p_zone),
         municipality_id = coalesce(p_municipality_id, municipality_id),
         price_unit = coalesce(p_price_unit, price_unit)
   where id = v_uid;
  if not found then
    raise exception 'No hay perfil de profesional.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.pro_update_pricing_zone(integer, integer, text, uuid, text) from public, anon;
grant execute on function public.pro_update_pricing_zone(integer, integer, text, uuid, text) to authenticated;

-- 5. list_pro_cards: 0104 body plus price_unit as the last column. Signature unchanged.
-- Return type changes, so the function is dropped and recreated, then re-granted.
drop function if exists public.list_pro_cards(text, text, uuid, text, text);
create or replace function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo',
                                      p_pro_type text default null)
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean, is_demo boolean,
              pro_type text, razon_social text, price_unit text)
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
         end as razon_social,
         p.price_unit
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.closed_at is null
    and (p_pro_id is not null or p.city = p_city)
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
    and (p_pro_type is null or p_pro_type = 'any' or p.pro_type = p_pro_type)
    and (not p.is_demo or p_pro_id is not null)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke all on function public.list_pro_cards(text, text, uuid, text, text) from public;
grant execute on function public.list_pro_cards(text, text, uuid, text, text) to anon, authenticated, service_role;

-- 6. get_price_guides: 0109 body. Only 'job'-unit pros count toward a range and the 3-or-more rule.
create or replace function public.get_price_guides()
returns table (
  trade text,
  sample integer,
  low_dop integer,
  high_dop integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with catalog(trade) as (
    select t.key from public.trades t where t.active
  ),
  stated as (
    select p.trade, p.price_min_dop, p.price_max_dop
    from public.pros p
    where p.verification_status = 'approved'
      and p.closed_at is null
      and p.is_demo = false
      and p.price_max_dop > 0
      and p.price_unit = 'job'
  ),
  agg as (
    select s.trade,
           count(*)::integer as sample,
           round(percentile_cont(0.5) within group (order by s.price_min_dop))::integer as low_dop,
           round(percentile_cont(0.5) within group (order by s.price_max_dop))::integer as high_dop
    from stated s
    group by s.trade
  )
  select c.trade,
         coalesce(a.sample, 0) as sample,
         case when coalesce(a.sample, 0) >= 3 then a.low_dop end as low_dop,
         case when coalesce(a.sample, 0) >= 3 then a.high_dop end as high_dop
  from catalog c
  left join agg a on a.trade = c.trade
  order by c.trade;
$$;

revoke all on function public.get_price_guides() from public;
grant execute on function public.get_price_guides() to anon, authenticated;
