-- Suspended pros cannot submit quotes (the way a pro accepts a new job).
-- In-progress jobs are not affected. Suspension is set by run_recovery_checks and
-- cleared when the recovery is settled (migration 0027).
create or replace function public.submit_quote(
  p_quote uuid, p_amount_dop integer, p_includes text, p_excludes text, p_materials_included boolean,
  p_window_start timestamptz, p_window_end timestamptz, p_duration_hours numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  q record;
  j record;
begin
  if exists (
    select 1 from public.pros where id = (select auth.uid()) and suspended_at is not null
  ) then
    raise exception 'Tu cuenta está suspendida hasta que pagues el saldo pendiente.';
  end if;

  select * into q from public.quotes where id = p_quote and pro_id = (select auth.uid()) for update;
  if not found then raise exception 'Esta solicitud no es tuya.'; end if;
  if q.status <> 'invited' then raise exception 'Esta solicitud ya no acepta cotizaciones.'; end if;
  if q.invited_at < now() - interval '24 hours' then
    update public.quotes set status = 'expired' where id = q.id;
    raise exception 'Se venció el plazo de 24 horas para responder.';
  end if;

  select * into j from public.jobs where id = q.job_id;
  if j.status not in ('requested', 'quoted') then raise exception 'Esta solicitud ya no está abierta.'; end if;

  if j.job_type = 'diagnostic' and (p_amount_dop < 500 or p_amount_dop > 1000) then
    raise exception 'La visita de diagnóstico cuesta entre RD$500 y RD$1,000.';
  end if;
  if p_amount_dop is null or p_amount_dop <= 0 then raise exception 'Escribe un precio válido.'; end if;
  if char_length(btrim(coalesce(p_includes, ''))) < 10 then raise exception 'Describe qué incluye el precio.'; end if;
  if p_materials_included is null then raise exception 'Indica si los materiales están incluidos.'; end if;
  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'La ventana de fecha y hora no es válida.';
  end if;
  if p_duration_hours is null or p_duration_hours <= 0 then raise exception 'Indica la duración estimada.'; end if;

  update public.quotes set
    status = 'sent',
    amount_dop = p_amount_dop,
    includes = btrim(p_includes),
    excludes = nullif(btrim(coalesce(p_excludes, '')), ''),
    materials_included = p_materials_included,
    window_start = p_window_start,
    window_end = p_window_end,
    duration_hours = p_duration_hours,
    responded_at = now(),
    valid_until = now() + interval '48 hours'
  where id = q.id;

  update public.jobs set status = 'quoted' where id = q.job_id and status = 'requested';
end;
$function$;

revoke all on function public.submit_quote(uuid, integer, text, text, boolean, timestamptz, timestamptz, numeric) from public;
grant execute on function public.submit_quote(uuid, integer, text, text, boolean, timestamptz, timestamptz, numeric) to authenticated;
