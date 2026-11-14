-- Server gate: create_job_request refuses any picked pro whose available flag is false.
-- Same body as before, plus the availability check in the pro loop. Applied to qmugoumizvtvuzndhosq.
-- Tested in a rolled-back transaction: an unavailable pro returns "Un profesional elegido no está disponible en este momento. Elige otro."

create or replace function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text, p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_pro uuid;
  v_open integer;
  v_unbooked integer;
  v_last_booking timestamptz;
  v_block_from timestamptz;
  v_price_ok boolean;
  v_available boolean;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_job_type not in ('repair', 'diagnostic') then raise exception 'Tipo de trabajo no válido.'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 20 then
    raise exception 'Describe el problema con al menos 20 caracteres.';
  end if;
  if p_photo_paths is null or cardinality(p_photo_paths) < 1 then
    raise exception 'Agrega al menos una foto del problema.';
  end if;
  if p_pro_ids is null or cardinality(p_pro_ids) < 1 or cardinality(p_pro_ids) > 3 then
    raise exception 'Elige entre 1 y 3 profesionales.';
  end if;
  if (select count(distinct x) from unnest(p_pro_ids) x) <> cardinality(p_pro_ids) then
    raise exception 'Hay profesionales repetidos.';
  end if;

  select max(booked_at) into v_last_booking from public.jobs where homeowner_id = v_uid;
  select count(*) into v_unbooked from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted')
     and created_at > now() - interval '30 days'
     and (v_last_booking is null or created_at > v_last_booking);
  if v_unbooked >= 5 then
    select created_at into v_block_from from public.jobs
     where homeowner_id = v_uid and status in ('requested', 'quoted')
       and created_at > now() - interval '30 days'
       and (v_last_booking is null or created_at > v_last_booking)
     order by created_at desc offset 4 limit 1;
    if now() < v_block_from + interval '14 days' then
      raise exception 'Tienes demasiadas solicitudes sin contratar. Puedes pedir cotizaciones de nuevo en 14 días.';
    end if;
  end if;

  select count(*) into v_open from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
  if v_open >= 3 then
    raise exception 'Ya tienes 3 solicitudes abiertas. Cancela una antes de pedir otra.';
  end if;

  foreach v_pro in array p_pro_ids loop
    select p.available into v_available from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
    -- Availability gate (UI phase §7, item 6): an unavailable pro gets no requests, even when the client calls this directly.
    if not v_available then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
  end loop;

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$function$;
