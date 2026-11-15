-- 0061 Admin roles (super_admin > admin), admin management, TOTP gate, audit log.
-- Not applied. Requires Fabian approval before apply.
--
-- Design:
--   profiles.role stays 'admin' for every admin, so existing role checks keep working.
--   profiles.admin_role separates the two levels: 'admin' or 'super_admin'.
--   is_admin() now also requires an AAL2 session (TOTP passed). Every admin check inherits it.
--   Guards live in the database: a non-super admin cannot change admin roles, the last
--   super admin cannot be removed or demoted, and nobody can revoke their own admin role.

-- 1. Admin level column. --------------------------------------------------------------
alter table public.profiles add column if not exists admin_role text;

-- Backfill: the existing admin becomes the first super admin (Fabian).
update public.profiles set admin_role = 'admin' where role = 'admin' and admin_role is null;
update public.profiles set admin_role = 'super_admin' where id = 'e538a84f-2712-4b6c-bd00-a7c2b80025e9';

alter table public.profiles drop constraint if exists profiles_admin_role_check;
alter table public.profiles add constraint profiles_admin_role_check
  check (admin_role in ('admin', 'super_admin'));

alter table public.profiles drop constraint if exists profiles_admin_role_consistent;
alter table public.profiles add constraint profiles_admin_role_consistent
  check ((role = 'admin') = (admin_role is not null));

-- 2. Session level. Admin access requires a TOTP-verified session (AAL2). ------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.admin_role = 'super_admin'
  );
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- 3. Guard: only a super admin can touch admin roles. Non-admin role changes (e.g. homeowner
--    to pro during onboarding) are not affected. Calls with no user (SQL editor) are allowed.
create or replace function public.admin_role_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.role = 'admin' or new.role = 'admin' or old.admin_role is not null or new.admin_role is not null)
     and (old.role is distinct from new.role or old.admin_role is distinct from new.admin_role)
     and (select auth.uid()) is not null
     and not public.is_super_admin() then
    raise exception 'Solo un super administrador puede cambiar roles de administrador.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_admin_role_guard on public.profiles;
create trigger profiles_admin_role_guard
  before update of role, admin_role on public.profiles
  for each row execute function public.admin_role_guard();

-- 4. Audit log. Written only by security definer functions. -------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id),
  action      text not null,
  target_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_log_read on public.admin_audit_log;
create policy admin_audit_log_read on public.admin_audit_log for select using (public.is_admin());
revoke insert, update, delete on public.admin_audit_log from authenticated, anon;

create or replace function public.admin_log(p_action text, p_target uuid, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values ((select auth.uid()), p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.admin_log(text, uuid, jsonb) from public, anon, authenticated;

-- 5. Admin management (super admin only). ----------------------------------------------
create or replace function public.admin_list_admins()
returns table (id uuid, full_name text, phone text, admin_role text, created_at timestamptz, totp_verified boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'No autorizado.'; end if;
  return query
    select p.id, p.full_name, p.phone, p.admin_role, p.created_at,
           exists (select 1 from auth.mfa_factors f
                    where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified')
      from public.profiles p
     where p.role = 'admin'
     order by p.created_at;
end;
$$;

-- Find a client account by phone, so a super admin can promote it. Returns no private data beyond name and role.
create or replace function public.admin_find_profile_by_phone(p_phone text)
returns table (id uuid, full_name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then raise exception 'No autorizado.'; end if;
  return query
    select p.id, p.full_name, p.role
      from public.profiles p
     where p.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     limit 1;
end;
$$;

-- Create an admin: promote an existing homeowner account. Pros and admins are not promoted here.
create or replace function public.admin_grant_admin(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  if not public.is_super_admin() then raise exception 'No autorizado.'; end if;
  select * into r from public.profiles where id = p_profile for update;
  if not found then raise exception 'La cuenta no existe.'; end if;
  if r.role <> 'homeowner' then
    raise exception 'Solo una cuenta de cliente puede convertirse en administrador.';
  end if;
  update public.profiles set role = 'admin', admin_role = 'admin' where id = p_profile;
  perform public.admin_log('admin_granted', p_profile, jsonb_build_object('by', (select auth.uid())));
end;
$$;

-- Promote to super admin, or demote to admin. Promotion needs AAL2 (already enforced by is_super_admin)
-- and the typed confirmation 'CONFIRMAR'. The last super admin cannot be demoted.
create or replace function public.admin_set_level(p_profile uuid, p_level text, p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_supers int;
begin
  if not public.is_super_admin() then raise exception 'No autorizado.'; end if;
  if p_level not in ('admin', 'super_admin') then raise exception 'Nivel no válido.'; end if;
  if p_level = 'super_admin' and p_confirm is distinct from 'CONFIRMAR' then
    raise exception 'Escribe CONFIRMAR para continuar.';
  end if;
  select * into r from public.profiles where id = p_profile for update;
  if not found or r.role <> 'admin' then raise exception 'La cuenta no es administradora.'; end if;
  if r.admin_role = p_level then return; end if;

  if p_level = 'admin' then
    perform 1 from public.profiles where admin_role = 'super_admin' for update;
    select count(*) into v_supers from public.profiles where admin_role = 'super_admin';
    if v_supers <= 1 then raise exception 'Debe quedar al menos un super administrador.'; end if;
  end if;

  update public.profiles set admin_role = p_level where id = p_profile;
  perform public.admin_log(
    case when p_level = 'super_admin' then 'admin_promoted_super' else 'admin_demoted_super' end,
    p_profile,
    jsonb_build_object('by', (select auth.uid()), 'to', p_level)
  );
end;
$$;

-- Delete an admin: revokes the admin role; the account becomes a homeowner again.
create or replace function public.admin_revoke_admin(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_supers int;
begin
  if not public.is_super_admin() then raise exception 'No autorizado.'; end if;
  if p_profile = (select auth.uid()) then raise exception 'No puedes eliminarte a ti mismo.'; end if;
  select * into r from public.profiles where id = p_profile for update;
  if not found or r.role <> 'admin' then raise exception 'La cuenta no es administradora.'; end if;

  if r.admin_role = 'super_admin' then
    perform 1 from public.profiles where admin_role = 'super_admin' for update;
    select count(*) into v_supers from public.profiles where admin_role = 'super_admin';
    if v_supers <= 1 then raise exception 'Debe quedar al menos un super administrador.'; end if;
  end if;

  update public.profiles set role = 'homeowner', admin_role = null where id = p_profile;
  perform public.admin_log('admin_revoked', p_profile,
    jsonb_build_object('by', (select auth.uid()), 'was', r.admin_role));
end;
$$;

revoke execute on function public.admin_list_admins() from public, anon;
revoke execute on function public.admin_find_profile_by_phone(text) from public, anon;
revoke execute on function public.admin_grant_admin(uuid) from public, anon;
revoke execute on function public.admin_set_level(uuid, text, text) from public, anon;
revoke execute on function public.admin_revoke_admin(uuid) from public, anon;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_find_profile_by_phone(text) to authenticated;
grant execute on function public.admin_grant_admin(uuid) to authenticated;
grant execute on function public.admin_set_level(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_admin(uuid) to authenticated;

-- 6. Audit the moderation actions (log only; decision logic unchanged from 0060). --------
create or replace function public.moderate_review(p_review uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede moderar reseñas.'; end if;
  if p_action not in ('publish', 'hide', 'remove') then raise exception 'Acción no válida.'; end if;
  if p_action in ('hide', 'remove') and char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).';
  end if;

  update public.reviews set
    status = case p_action when 'publish' then 'published' when 'hide' then 'hidden' else 'removed' end,
    status_reason = case when p_action = 'publish' then null else btrim(p_reason) end,
    flag_reasons = case when p_action = 'publish' then '{}'::text[] else flag_reasons end,
    status_at = now()
  where id = p_review;
  if not found then raise exception 'La reseña no existe.'; end if;
  perform public.admin_log('review_' || p_action, p_review, jsonb_build_object('reason', p_reason));
end;
$function$;

create or replace function public.moderate_review_response(p_review uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede moderar respuestas.'; end if;
  if p_action not in ('publish', 'hide') then raise exception 'Acción no válida.'; end if;
  update public.review_responses set
    status = case p_action when 'publish' then 'published' else 'hidden' end,
    flag_reasons = case when p_action = 'publish' then '{}'::text[] else flag_reasons end,
    updated_at = now()
   where review_id = p_review;
  if not found then raise exception 'La respuesta no existe.'; end if;
  perform public.admin_log('reply_' || p_action, p_review, '{}'::jsonb);
end;
$function$;

-- Not in this migration (money logic, needs its own review before logging is added):
--   dispute decisions (admin decide), payout and refund actions, pro report resolution.
