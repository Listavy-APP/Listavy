-- Listavy · 0009 · Customer profile: photo, email (verified), zone.
-- Rules:
--   * Customer photo: private bucket 'customer-avatars', path <customer_uuid>/<random>.jpg.
--     Read by the owner, admins, and pros with a job or quote with that customer. No public URLs.
--   * No admin pre-review for customer photos. Flag-and-remove (handled in the app and admin).
--   * Email is a contact field, never a login. It changes only through the verification flow
--     (Edge Function, service role). Owners cannot set email or email_verified_at directly.
--   * Phone is never changed from the profile. Phone change is the OTP flow.
--   * get_customer_card returns first name, avatar path, zone. No email, no phone, no full name.

-- ---------------------------------------------------------------------------
-- Profile columns.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column email             text,
  add column email_verified_at timestamptz,
  add column zone              text,
  add column avatar_path       text;

-- Owners and admins may read their own row (existing policy). The guard below
-- decides which columns an owner may change.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null only for SQL editor / service role (bootstrap and the email Edge Function).
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Solo un administrador puede cambiar el rol.';
    end if;
    if new.phone is distinct from old.phone then
      raise exception 'El teléfono no se puede cambiar desde el perfil.';
    end if;
    if new.email is distinct from old.email
       or new.email_verified_at is distinct from old.email_verified_at then
      raise exception 'El correo se verifica con un código.';
    end if;
    if new.avatar_path is distinct from old.avatar_path
       and new.avatar_path is not null
       and split_part(new.avatar_path, '/', 1) <> (select auth.uid())::text then
      raise exception 'La foto de perfil debe estar en tu carpeta.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pro-customer relationship: a pro has a job with the customer, or a quote on one of its jobs.
-- ---------------------------------------------------------------------------
create or replace function public.pro_has_customer(p_customer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
     where j.homeowner_id = p_customer
       and (j.pro_id = (select auth.uid())
            or exists (select 1 from public.quotes q
                        where q.job_id = j.id and q.pro_id = (select auth.uid())))
  );
$$;

revoke execute on function public.pro_has_customer(uuid) from public, anon;
grant execute on function public.pro_has_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private bucket for customer photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('customer-avatars', 'customer-avatars', false)
on conflict (id) do update set public = false;

-- Storage helper: may the caller see this object? Folder = customer uuid.
create or replace function public.can_view_customer_avatar(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return v_folder::uuid = (select auth.uid())
      or public.is_admin()
      or public.pro_has_customer(v_folder::uuid);
end;
$$;

revoke execute on function public.can_view_customer_avatar(text) from public, anon;
grant execute on function public.can_view_customer_avatar(text) to authenticated;

create policy customer_avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy customer_avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'customer-avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy customer_avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'customer-avatars' and public.can_view_customer_avatar(name));

-- ---------------------------------------------------------------------------
-- Customer card for pros and admins. Only fields the pro needs.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_card(p_customer uuid)
returns table (first_name text, avatar_path text, zone text)
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), '') as first_name,
         pr.avatar_path,
         pr.zone
    from public.profiles pr
   where pr.id = p_customer
     and (public.is_admin() or public.pro_has_customer(p_customer));
$$;

revoke execute on function public.get_customer_card(uuid) from public, anon;
grant execute on function public.get_customer_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Email verification codes. Written and read only by the Edge Function (service role).
-- Codes are stored as hashes, single-use, 15 minutes, 3 attempts.
-- ---------------------------------------------------------------------------
create table public.email_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  email       text not null,
  code_hash   text not null,
  attempts    smallint not null default 0 check (attempts >= 0),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.email_verifications enable row level security;
revoke all on public.email_verifications from public, anon, authenticated;
