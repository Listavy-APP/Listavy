-- Listavy · 0003 · Sprint 1: pro onboarding, discovery, admin review.

-- ---------------------------------------------------------------------------
-- Zones. Santo Domingo only, v1. PROVISIONAL list: confirm with ground verifier.
-- ---------------------------------------------------------------------------
alter table public.pros add constraint pros_zone_valid check (zone in (
  'Piantini', 'Naco', 'Bella Vista', 'Gazcue', 'Serrallés', 'Ciudad Colonial',
  'Los Cacicazgos', 'Evaristo Morales', 'Mirador Norte', 'Mirador Sur',
  'Villa Juana', 'Los Prados', 'Arroyo Hondo', 'Ensanche Ozama', 'Los Mina'
));

-- ---------------------------------------------------------------------------
-- Pro files: ID documents (private to owner and admins) and work photos
-- (visible to signed-in users only when the pro is approved).
-- Kept out of `pros` because pros rows are publicly readable when approved.
-- ---------------------------------------------------------------------------
create table public.pro_files (
  id           uuid primary key default gen_random_uuid(),
  pro_id       uuid not null references public.pros (id) on delete cascade,
  kind         text not null check (kind in ('id_document', 'work_photo')),
  storage_path text not null unique,
  created_at   timestamptz not null default now()
);

alter table public.pro_files enable row level security;

create policy pro_files_insert_own on public.pro_files for insert
  with check (pro_id = (select auth.uid()));

create policy pro_files_select on public.pro_files for select
  using (
    pro_id = (select auth.uid())
    or public.is_admin()
    or (kind = 'work_photo' and exists (
          select 1 from public.pros p
          where p.id = pro_files.pro_id and p.verification_status = 'approved'))
  );

create index pro_files_pro_idx on public.pro_files (pro_id);

-- ---------------------------------------------------------------------------
-- Public-facing pro cards. Only approved pros, only safe columns.
-- No phone, no ID documents, no verification internals.
-- The view runs with owner rights, so it returns approved rows only by its own WHERE.
-- ---------------------------------------------------------------------------
create or replace view public.pro_cards as
select
  p.id,
  pr.full_name,
  p.trade,
  p.zone,
  p.price_min_dop,
  p.price_max_dop,
  p.plan,
  p.verified_at
from public.pros p
join public.profiles pr on pr.id = p.id
where p.verification_status = 'approved';

revoke all on public.pro_cards from anon, public;
grant select on public.pro_cards to authenticated;

-- ---------------------------------------------------------------------------
-- Admin review. The only path that verifies, suspends, or grants the pro role.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_pro(p_pro uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar profesionales.';
  end if;
  if p_status not in ('approved', 'suspended', 'pending') then
    raise exception 'Estado no válido: %', p_status;
  end if;

  update public.pros
     set verification_status = p_status,
         verified_at = case when p_status = 'approved' then now() else null end,
         verified_by = case when p_status = 'approved' then (select auth.uid()) else null end
   where id = p_pro;

  if not found then
    raise exception 'Profesional no encontrado.';
  end if;

  if p_status = 'approved' then
    update public.profiles set role = 'pro' where id = p_pro and role = 'homeowner';
  end if;
end;
$$;

revoke execute on function public.admin_review_pro(uuid, text) from public, anon;
grant execute on function public.admin_review_pro(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets. Both private. Access goes through signed URLs.
-- Object path convention: <pro_uuid>/<random>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pro-documents', 'pro-documents', false),
       ('pro-work-photos', 'pro-work-photos', false)
on conflict (id) do nothing;

create policy pro_documents_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'pro-documents'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy pro_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'pro-documents'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create policy work_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'pro-work-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy work_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'pro-work-photos' and (
           (storage.foldername(name))[1] = (select auth.uid())::text
           or public.is_admin()
           or exists (select 1 from public.pros p
                      where p.id::text = (storage.foldername(name))[1]
                        and p.verification_status = 'approved')));
