-- 0110: companies name their own line of work (Item 10, Part 4). Companies only.
-- A company picks a primary catalog trade (required, as before) and may add a free-text
-- write-in (custom_line). The public profile shows the write-in. The admin queue resolves it:
--   mapped        primary trade set to an existing catalog trade (any admin)
--   created       a new catalog trade created from the write-in (super admin only)
--   profile_only  kept as a profile label, no catalog change (any admin)
-- Individuals stay catalog-only.

-- 1. Columns ------------------------------------------------------------------
alter table public.pros add column if not exists custom_line text
  check (custom_line is null or length(custom_line) between 2 and 80);
alter table public.pros add column if not exists custom_line_resolution text
  check (custom_line_resolution in ('mapped', 'created', 'profile_only'));
alter table public.pros drop constraint if exists pros_custom_line_company_only;
alter table public.pros add constraint pros_custom_line_company_only
  check (custom_line is null or pro_type = 'company');

-- Guard (0110). Table grants can be wider than the column grants in some environments, so the
-- trigger is the enforcement point. The write-in and its resolution are admin-only. Specialties
-- change only through pro_set_specialties, which sets the internal flag for its own statement.
create or replace function public.guard_pro_custom_line_specialties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.custom_line is distinct from old.custom_line
       or new.custom_line_resolution is distinct from old.custom_line_resolution then
      raise exception 'Solo un administrador puede cambiar el giro de la empresa.' using errcode = '42501';
    end if;
    if new.specialties is distinct from old.specialties
       and coalesce(current_setting('listavy.specialties_write', true), '') <> 'on' then
      raise exception 'Cambia tus especialidades desde tu perfil.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pros_guard_custom_line_specialties on public.pros;
create trigger pros_guard_custom_line_specialties
  before update on public.pros
  for each row execute function public.guard_pro_custom_line_specialties();

-- Public read: the write-in is shown on approved profiles. The resolution stays admin-side.
grant select (custom_line) on public.pros to anon, authenticated;

-- Folded specialties (Part 1): a pro picks from the catalog's list for their trade.
-- Written only through pro_set_specialties, which validates against trades.specialties.
alter table public.pros add column if not exists specialties text[] not null default '{}'
  check (cardinality(specialties) <= 12);
grant select (specialties) on public.pros to anon, authenticated;

create or replace function public.pro_set_specialties(p_specialties text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trade text;
  v_clean text[];
  v_allowed text[];
begin
  if v_uid is null then
    raise exception 'Debes entrar primero.' using errcode = '42501';
  end if;
  select p.trade into v_trade from public.pros p where p.id = v_uid;
  if not found then
    raise exception 'No tienes una solicitud de profesional.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct s order by s), '{}') into v_clean
    from unnest(coalesce(p_specialties, '{}')) as s
    where nullif(trim(s), '') is not null;
  if cardinality(v_clean) > 12 then
    raise exception 'Elige hasta 12 especialidades.' using errcode = '22023';
  end if;
  select coalesce(t.specialties, '{}') into v_allowed from public.trades t where t.key = v_trade;
  if exists (select 1 from unnest(v_clean) as c where not (c = any (v_allowed))) then
    raise exception 'Especialidad no válida para tu oficio.' using errcode = '22023';
  end if;
  perform set_config('listavy.specialties_write', 'on', true);
  update public.pros set specialties = v_clean where id = v_uid;
  perform set_config('listavy.specialties_write', '', true);
end;
$$;

revoke all on function public.pro_set_specialties(text[]) from public, anon;
grant execute on function public.pro_set_specialties(text[]) to authenticated;

-- 2. Signup: create_pro_application takes the optional write-in -------------
drop function if exists public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text);

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
  p_custom_line  text default null
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
begin
  if uid is null then
    raise exception 'Debes entrar primero.';
  end if;
  if p_pro_type not in ('individual', 'company') then
    raise exception 'Tipo de profesional no válido.';
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

  update public.profiles set full_name = p_full_name where id = uid;

  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, pro_type, custom_line)
    values (uid, p_trade, p_zone, p_price_min, p_price_max, p_pro_type, v_line);

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

revoke execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text) from public, anon;
grant execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text) to authenticated;

-- 3. Admin queue shows the write-in and its resolution ----------------------
drop function if exists public.admin_pending_pros(integer);

create or replace function public.admin_pending_pros(p_limit integer default null)
returns table (
  id uuid,
  trade text,
  zone text,
  city text,
  price_min_dop integer,
  price_max_dop integer,
  created_at timestamptz,
  pro_type text,
  full_name text,
  phone text,
  custom_line text,
  custom_line_resolution text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  return query
    select p.id, p.trade, p.zone, p.city, p.price_min_dop, p.price_max_dop, p.created_at, p.pro_type,
           pr.full_name, pr.phone, p.custom_line, p.custom_line_resolution
    from public.pros p
    left join public.profiles pr on pr.id = p.id
    where p.verification_status = 'pending' and p.closed_at is null
    order by p.created_at desc
    limit p_limit;
end;
$$;

revoke all on function public.admin_pending_pros(integer) from public;
grant execute on function public.admin_pending_pros(integer) to authenticated;

-- 4. Admin resolution of a write-in ------------------------------------------
create or replace function public.admin_resolve_custom_line(
  p_pro uuid,
  p_action text,
  p_trade text,
  p_new_key text,
  p_new_label text,
  p_new_slug text,
  p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro public.pros;
  v_key text;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  select * into v_pro from public.pros where id = p_pro for update;
  if not found or v_pro.pro_type <> 'company' or v_pro.custom_line is null then
    raise exception 'Esta empresa no tiene un giro por resolver.' using errcode = '22023';
  end if;
  if v_pro.custom_line_resolution is not null then
    raise exception 'Este giro ya fue resuelto.' using errcode = '22023';
  end if;

  if p_action = 'map' then
    if p_trade is null or not exists (select 1 from public.trades where key = p_trade and active) then
      raise exception 'Oficio no válido.' using errcode = '22023';
    end if;
    update public.pros set trade = p_trade, custom_line_resolution = 'mapped', specialties = '{}' where id = p_pro;
    v_key := p_trade;

  elsif p_action = 'create_trade' then
    if not public.is_super_admin() then
      raise exception 'Solo un super administrador puede crear un oficio.' using errcode = '42501';
    end if;
    if p_new_key is null or p_new_key !~ '^[a-z][a-z_]{1,39}$' then
      raise exception 'Clave de oficio no válida.' using errcode = '22023';
    end if;
    if exists (select 1 from public.trades where key = p_new_key) then
      raise exception 'Ese oficio ya existe.' using errcode = '22023';
    end if;
    insert into public.trades (key, label_es, slug, specialties, created_by)
      values (p_new_key, trim(p_new_label), p_new_slug, '{}', (select auth.uid()));
    update public.pros set trade = p_new_key, custom_line_resolution = 'created', specialties = '{}' where id = p_pro;
    v_key := p_new_key;

  elsif p_action = 'profile_only' then
    update public.pros set custom_line_resolution = 'profile_only' where id = p_pro;
    v_key := null;

  else
    raise exception 'Acción no válida.' using errcode = '22023';
  end if;

  perform public.admin_log('custom_line_resolved', p_pro,
    jsonb_build_object('action', p_action, 'trade', v_key, 'custom_line', v_pro.custom_line,
                       'reason', trim(p_reason)));
end;
$$;

revoke all on function public.admin_resolve_custom_line(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_resolve_custom_line(uuid, text, text, text, text, text, text) to authenticated;
