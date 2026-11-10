-- Listavy · 0008 · Pro profile photo (optional at registration).
-- Rules:
--   * Stored as a pro_files row, kind 'avatar', with review_status 'pending' until an admin decides.
--   * Owners can insert it but cannot change review_status (no update policy on pro_files).
--   * Only an approved avatar is shown, on search and on the public profile.
--   * A pending avatar blocks approval of the pro. A rejected avatar does not block it.
--   * Public bucket 'pro-avatars'. Paths are <pro_uuid>/<random>.jpg, unguessable and listed only in pro_files.

-- ---------------------------------------------------------------------------
-- pro_files: avatar kind and review columns.
-- ---------------------------------------------------------------------------
alter table public.pro_files drop constraint pro_files_kind_check;
alter table public.pro_files add constraint pro_files_kind_check
  check (kind in ('id_document', 'work_photo', 'company_document', 'avatar'));

alter table public.pro_files
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  add column reviewed_by uuid,
  add column reviewed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Public bucket for approved profile photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pro-avatars', 'pro-avatars', true)
on conflict (id) do update set public = true;

create policy pro_avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'pro-avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Admin: approve or reject a profile photo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_avatar(p_file uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar fotos de perfil.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Estado no válido: %', p_status;
  end if;

  update public.pro_files
     set review_status = p_status,
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where id = p_file and kind = 'avatar';

  if not found then
    raise exception 'Foto de perfil no encontrada.';
  end if;
end;
$$;

revoke execute on function public.admin_review_avatar(uuid, text) from public, anon;
grant execute on function public.admin_review_avatar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin review: approval waits for the profile photo review, and company rules still apply.
-- Replaces the 0007 version.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_pro(p_pro uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro_type text;
  v_rnc_ok   boolean;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar profesionales.';
  end if;
  if p_status not in ('approved', 'suspended', 'pending') then
    raise exception 'Estado no válido: %', p_status;
  end if;

  select pro_type into v_pro_type from public.pros where id = p_pro;
  if not found then
    raise exception 'Profesional no encontrado.';
  end if;

  if p_status = 'approved' and v_pro_type = 'company' then
    select rnc_verified_at is not null into v_rnc_ok
      from public.pro_companies where pro_id = p_pro;
    if not coalesce(v_rnc_ok, false) then
      raise exception 'Verifica el RNC en DGII antes de aprobar esta empresa.';
    end if;
  end if;

  if p_status = 'approved' and exists (
       select 1 from public.pro_files
        where pro_id = p_pro and kind = 'avatar' and review_status = 'pending') then
    raise exception 'Revisa la foto de perfil antes de aprobar.';
  end if;

  update public.pros
     set verification_status = p_status,
         verified_at = case when p_status = 'approved' then now() else null end,
         verified_by = case when p_status = 'approved' then (select auth.uid()) else null end
   where id = p_pro;

  if p_status = 'approved' then
    update public.profiles set role = 'pro' where id = p_pro and role = 'homeowner';
  end if;
end;
$$;

revoke execute on function public.admin_review_pro(uuid, text) from public, anon;
grant execute on function public.admin_review_pro(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public cards: add the approved avatar path. Return type changes, so drop first.
-- ---------------------------------------------------------------------------
drop function if exists public.list_pro_cards(text, text, uuid);

create or replace function public.list_pro_cards(
  p_trade text default null,
  p_zone text default null,
  p_pro_id uuid default null
)
returns table (
  id uuid,
  full_name text,
  trade text,
  zone text,
  price_min_dop integer,
  price_max_dop integer,
  plan text,
  verified_at timestamptz,
  avatar_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, pr.full_name, p.trade, p.zone, p.price_min_dop, p.price_max_dop, p.plan, p.verified_at,
         (select f.storage_path from public.pro_files f
           where f.pro_id = p.id and f.kind = 'avatar' and f.review_status = 'approved'
           order by f.created_at desc limit 1) as avatar_path
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke execute on function public.list_pro_cards(text, text, uuid) from public, anon;
grant execute on function public.list_pro_cards(text, text, uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Application submit gains an optional avatar. Same single transaction as 0007.
-- The avatar path must sit in the caller's own folder.
-- ---------------------------------------------------------------------------
drop function if exists public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text);

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
  p_avatar_path  text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  work_path text;
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
  if p_avatar_path is not null and split_part(p_avatar_path, '/', 1) <> uid::text then
    raise exception 'La foto de perfil debe estar en tu carpeta.';
  end if;

  update public.profiles set full_name = p_full_name where id = uid;

  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, pro_type)
    values (uid, p_trade, p_zone, p_price_min, p_price_max, p_pro_type);

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

revoke execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text) from public, anon;
grant execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text) to authenticated;
