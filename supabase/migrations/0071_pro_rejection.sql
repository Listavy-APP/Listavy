-- 0071: Reject a pending pro application with a reason (option A). NOT APPLIED.
-- Pre-apply baseline (prod, 2026-11-15): admin_review_pro(uuid,text) per 0003; guard_pro_privileges per
-- 0001 + pro_free_until rule. This migration preserves both.

-- 1. Status set and reason column.
alter table public.pros drop constraint if exists pros_verification_status_check;
alter table public.pros add constraint pros_verification_status_check
  check (verification_status in ('pending', 'approved', 'suspended', 'rejected'));

alter table public.pros add column if not exists rejection_reason text
  check (rejection_reason is null or char_length(rejection_reason) <= 500);

-- 2. Guard. Owner may resubmit only rejected -> pending with the reason cleared.
--    Admin decisions go through admin_review_pro. The pro_free_until rule is unchanged.
create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       and not (old.verification_status = 'rejected' and new.verification_status = 'pending') then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
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

-- 3. Admin decision. Same signature plus an optional reason. Logs approve/reject to the Bitácora.
drop function if exists public.admin_review_pro(uuid, text);

create or replace function public.admin_review_pro(p_pro uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro_type text;
  v_rnc_ok   boolean;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar profesionales.';
  end if;
  if p_status not in ('approved', 'suspended', 'pending', 'rejected') then
    raise exception 'Estado no válido: %', p_status;
  end if;
  if p_status = 'rejected' and (v_reason is null or char_length(v_reason) > 500) then
    raise exception 'Escribe el motivo del rechazo (máximo 500 caracteres).';
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
         verified_by = case when p_status = 'approved' then (select auth.uid()) else null end,
         rejection_reason = case when p_status = 'rejected' then v_reason else null end
   where id = p_pro;

  if p_status = 'approved' then
    update public.profiles set role = 'pro' where id = p_pro and role = 'homeowner';
  end if;

  if p_status in ('approved', 'rejected') then
    perform public.admin_log(
      case when p_status = 'approved' then 'pro_approved' else 'pro_rejected' end,
      p_pro,
      jsonb_build_object('status', p_status, 'reason', v_reason, 'pro_type', v_pro_type)
    );
  end if;
end;
$$;

revoke execute on function public.admin_review_pro(uuid, text, text) from public, anon;
grant execute on function public.admin_review_pro(uuid, text, text) to authenticated, service_role;
