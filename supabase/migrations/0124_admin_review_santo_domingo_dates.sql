-- 0124: admin_review_verification judges dates on the Santo Domingo calendar, not the database (UTC) date.
-- Only change from 0121: v_today (America/Santo_Domingo) replaces the database date in every date check and
-- in the company_entity expiry. Messages, the buena conducta one-year expiry, signature and grants are unchanged.
-- NOT APPLIED. Sam applies this file on Fabian's go.

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
  -- Santo Domingo calendar date (UTC-4, no DST), used for every date check below.
  v_today date := (now() at time zone 'America/Santo_Domingo')::date;
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
    if p_issue_date is null or p_issue_date < v_today - 30 or p_issue_date > v_today then
      raise exception 'El certificado debe tener menos de 30 días de emitido.';
    end if;
    v_expires := p_issue_date + interval '1 year';
  elsif v_row.stage = 'company_registry' then
    if p_expires_at is null or p_expires_at <= v_today then
      raise exception 'El Registro Mercantil requiere una fecha de vencimiento futura.';
    end if;
    v_expires := p_expires_at;
  elsif v_row.stage = 'company_entity' then
    v_expires := v_today + interval '1 year';
  elsif v_row.stage = 'insurance' then
    if p_expires_at is null or p_expires_at <= v_today then
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
