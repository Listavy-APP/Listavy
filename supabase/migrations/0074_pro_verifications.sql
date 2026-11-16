-- Listavy · 0074 · B1 pro verification ladder (DRAFT, awaiting Sam's review; NOT applied).
-- Spec: LISTAVY_B1_VERIFICATION_BUILD_PLAN_2026-11-16.md
-- Wording, consent version and retention are DRAFT pending counsel.

-- ---------------------------------------------------------------------------
-- One row per submitted verification document. History is kept; the current
-- badge is the newest approved, unexpired row per stage (see pro_current_verifications).
-- ---------------------------------------------------------------------------
create table public.pro_verifications (
  id              uuid primary key default gen_random_uuid(),
  pro_id          uuid not null references public.pros (id) on delete cascade,
  stage           text not null check (stage in (
                    'identity', 'buena_conducta', 'sie_licence', 'infotep_certificate', 'insurance',
                    'company_entity', 'company_registry', 'representative')),
  storage_path    text,                       -- private: pro-documents bucket, <pro_id>/<uuid>.<ext>
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  issue_date      date,
  expires_at      date,
  verified_at     timestamptz,
  verified_by     uuid references public.profiles (id),
  reason          text check (reason is null or length(reason) <= 500),
  details         jsonb not null default '{}'::jsonb,   -- e.g. DGII estado, RM number. No full cédula or certificate text.
  consent_version text,                        -- DRAFT consent version the pro accepted at submission
  created_at      timestamptz not null default now(),
  -- A pro submits pending rows only. Review fields are set by the RPC below.
  constraint pro_verifications_review_fields check (
    (status = 'pending' and verified_at is null and verified_by is null)
    or status <> 'pending'),
  constraint pro_verifications_consent_on_submit check (
    status <> 'pending' or consent_version is not null)
);

create index pro_verifications_pro_idx on public.pro_verifications (pro_id, stage, created_at desc);
create index pro_verifications_pending_idx on public.pro_verifications (created_at) where status = 'pending';

alter table public.pro_verifications enable row level security;

-- Owner reads own rows; admins read all. Nobody updates or deletes directly: review goes through the RPC.
create policy pro_verifications_select on public.pro_verifications for select
  using (pro_id = (select auth.uid()) or public.is_admin());

create policy pro_verifications_insert_own on public.pro_verifications for insert
  with check (pro_id = (select auth.uid()) and status = 'pending' and consent_version is not null);

-- ---------------------------------------------------------------------------
-- Admin review. Approves or rejects one row and writes the Bitácora.
-- Approve rules:
--   buena_conducta: issue_date within the last 30 days (Listavy rule, from the PGR certificate date).
--                   expires_at = issue_date + 6 months (Listavy renewal policy, not a PGR rule).
--   company_registry: expires_at required (RM certificate, 2-year cycle).
--   insurance: expires_at required (a policy always has an expiry).
--   sie_licence: expires_at required only when the licence shows one.
--   company_entity: expires_at = today + 1 year (annual DGII re-check, Listavy policy).
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_verification(
  p_id uuid,
  p_decision text,
  p_reason text default null,
  p_issue_date date default null,
  p_expires_at date default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pro_verifications%rowtype;
  v_expires date;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar verificaciones.';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisión no válida.';
  end if;

  select * into v_row from public.pro_verifications where id = p_id for update;
  if not found then
    raise exception 'La verificación no existe.';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'La verificación ya fue revisada.';
  end if;

  if p_decision = 'rejected' then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'Indica el motivo del rechazo.';
    end if;
    update public.pro_verifications
       set status = 'rejected', reason = trim(p_reason), verified_at = now(), verified_by = (select auth.uid())
     where id = p_id;
    perform public.admin_log('verification.rejected', v_row.pro_id,
      jsonb_build_object('stage', v_row.stage, 'verification_id', p_id, 'reason', trim(p_reason)));
    return;
  end if;

  if v_row.stage = 'buena_conducta' then
    if p_issue_date is null or p_issue_date < current_date - 30 or p_issue_date > current_date then
      raise exception 'El certificado debe tener menos de 30 días de emitido.';
    end if;
    v_expires := p_issue_date + interval '6 months';
  elsif v_row.stage = 'company_registry' then
    if p_expires_at is null or p_expires_at <= current_date then
      raise exception 'El Registro Mercantil requiere una fecha de vencimiento futura.';
    end if;
    v_expires := p_expires_at;
  elsif v_row.stage = 'company_entity' then
    v_expires := current_date + interval '1 year';
  elsif v_row.stage = 'insurance' then
    if p_expires_at is null or p_expires_at <= current_date then
      raise exception 'La póliza requiere una fecha de vencimiento futura.';
    end if;
    v_expires := p_expires_at;
  elsif v_row.stage = 'sie_licence' then
    v_expires := p_expires_at;  -- required when the licence shows one; null means no expiry on the document
  else
    v_expires := null;          -- identity, infotep_certificate, representative
  end if;

  update public.pro_verifications
     set status = 'approved',
         issue_date = coalesce(p_issue_date, issue_date),
         expires_at = v_expires,
         verified_at = now(),
         verified_by = (select auth.uid()),
         details = details || coalesce(p_details, '{}'::jsonb)
   where id = p_id;

  perform public.admin_log('verification.approved', v_row.pro_id,
    jsonb_build_object('stage', v_row.stage, 'verification_id', p_id, 'expires_at', v_expires));
end;
$$;
revoke execute on function public.admin_review_verification(uuid, text, text, date, date, jsonb) from public, anon;
grant execute on function public.admin_review_verification(uuid, text, text, date, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Public badge source. Returns only stage, verified date and expiry: no storage paths,
-- no details, no reasons. Lapsed rows (expires_at in the past) are excluded, so a
-- badge disappears on expiry without a job.
-- ---------------------------------------------------------------------------
create or replace function public.pro_current_verifications(p_pro uuid)
returns table (stage text, verified_at timestamptz, expires_at date)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (v.stage) v.stage, v.verified_at, v.expires_at
  from public.pro_verifications v
  where v.pro_id = p_pro
    and v.status = 'approved'
    and (v.expires_at is null or v.expires_at >= current_date)
  order by v.stage, v.verified_at desc;
$$;
revoke execute on function public.pro_current_verifications(uuid) from public;
grant execute on function public.pro_current_verifications(uuid) to anon, authenticated;
