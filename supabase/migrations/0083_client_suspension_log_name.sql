-- 0083: Bitácora entry for a client suspension includes the suspended person's name.
-- Scope: admin_suspend_client only. Unsuspend is unchanged.
-- NOT APPLIED. Sam reviews, then Fabian approves before this runs in production.
-- Only change: details gains client_name, read from profiles at write time.
-- Rows written before this migration have no client_name; the Bitácora shows no name for them.

create or replace function public.admin_suspend_client(p_client uuid, p_reason text)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  if p_client = (select auth.uid()) then raise exception 'No puedes suspender tu propia cuenta.'; end if;
  -- Any non-admin account can be suspended as a client. A pro who also books jobs is covered.
  -- The trigger blocks only new job requests, not pro work.
  if not exists (select 1 from public.profiles where id = p_client and role <> 'admin') then
    raise exception 'Cuenta no encontrada o es de administrador.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'Escribe un motivo de al menos 10 caracteres.'; end if;
  if public.is_client_suspended(p_client) then raise exception 'La cuenta ya está suspendida.'; end if;

  insert into public.client_suspensions (client_id, reason, suspended_by)
  values (p_client, trim(p_reason), (select auth.uid()));

  perform public.admin_log(
    'client_suspended',
    p_client,
    jsonb_build_object(
      'reason', trim(p_reason),
      'client_name', (select pr.full_name from public.profiles pr where pr.id = p_client)
    )
  );
end;
$function$;
