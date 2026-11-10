-- Listavy · 0007 · Company verification for pros (RNC from DGII).
-- The RNC is private: it lives in pro_companies, never in pros (pros rows are public when approved).

-- ---------------------------------------------------------------------------
-- Pro type: individual (default) or company.
-- ---------------------------------------------------------------------------
alter table public.pros
  add column pro_type text not null default 'individual'
  check (pro_type in ('individual', 'company'));

-- ---------------------------------------------------------------------------
-- Company data. Owner and admins only. No public or homeowner access.
-- ---------------------------------------------------------------------------
create table public.pro_companies (
  pro_id          uuid primary key references public.pros (id) on delete cascade,
  razon_social    text not null check (length(trim(razon_social)) > 0),
  rnc             text not null check (rnc ~ '^[0-9]{9}$'),
  rnc_verified_at timestamptz,
  rnc_verified_by uuid,
  created_at      timestamptz not null default now()
);

alter table public.pro_companies enable row level security;

create policy pro_companies_insert_own on public.pro_companies for insert
  with check (
    pro_id = (select auth.uid())
    and exists (select 1 from public.pros p
                where p.id = pro_companies.pro_id and p.pro_type = 'company')
  );

create policy pro_companies_select on public.pro_companies for select
  using (pro_id = (select auth.uid()) or public.is_admin());

-- No update or delete policy for owners. Verification fields change only through admin_verify_rnc.
-- Owner rows are read-only after insert, so the applicant cannot change the RNC after review.

-- ---------------------------------------------------------------------------
-- Pro files: add the company document kind. Stays private (owner and admin only).
-- ---------------------------------------------------------------------------
alter table public.pro_files drop constraint pro_files_kind_check;
alter table public.pro_files add constraint pro_files_kind_check
  check (kind in ('id_document', 'work_photo', 'company_document'));

-- ---------------------------------------------------------------------------
-- Admin: record that the admin checked the RNC in the DGII public lookup.
-- The admin confirms the razón social match and the status (not "Suspendido") before calling this.
-- ---------------------------------------------------------------------------
create or replace function public.admin_verify_rnc(p_pro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede verificar el RNC.';
  end if;

  update public.pro_companies
     set rnc_verified_at = now(),
         rnc_verified_by = (select auth.uid())
   where pro_id = p_pro;

  if not found then
    raise exception 'Este profesional no tiene datos de empresa.';
  end if;
end;
$$;

revoke execute on function public.admin_verify_rnc(uuid) from public, anon;
grant execute on function public.admin_verify_rnc(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin review: company pros cannot be approved until the RNC is verified.
-- Replaces the 0003 version; the rest of the logic is unchanged.
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
-- Application submit. One transaction: name, pro row, company row, file rows.
-- A failed company insert rolls back the pro row, so the applicant can retry.
-- Runs as the caller (security invoker), so the table RLS policies still apply.
-- Files are uploaded before this call; storage cannot join the transaction.
-- ---------------------------------------------------------------------------
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
  p_rnc          text
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
end;
$$;

revoke execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text) from public, anon;
grant execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text) to authenticated;
