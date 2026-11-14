-- 0041 · Reset the referral write flags right after each internal write.
-- set_config(..., true) lasts for the whole transaction. Without a reset, a later user write in the
-- same transaction would pass the guard. Each internal writer now turns its flag back off.

create or replace function public.get_my_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_code text;
  v_name text;
  v_try integer := 0;
begin
  if uid is null then raise exception 'Debes entrar primero.'; end if;
  select referral_code, full_name into v_code, v_name from public.profiles where id = uid;
  if not found then raise exception 'No hay perfil.'; end if;
  if v_code is not null then return v_code; end if;

  loop
    v_try := v_try + 1;
    v_code := upper(left(regexp_replace(coalesce(split_part(coalesce(v_name, ''), ' ', 1), ''), '[^A-Za-z]', '', 'g'), 8));
    if length(v_code) < 2 then v_code := 'LISTAVY'; end if;
    v_code := v_code || lpad(floor(random() * 1000)::integer::text, 3, '0');
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
    if v_try >= 50 then raise exception 'No se pudo crear tu código. Intenta de nuevo.'; end if;
  end loop;

  perform set_config('listavy.referral_write', 'on', true);
  update public.profiles set referral_code = v_code where id = uid;
  perform set_config('listavy.referral_write', 'off', true);
  return v_code;
end;
$$;

create or replace function public.claim_referral(p_code text, p_track text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.referral_settings;
  v_owner_id uuid;
  v_owner_phone text;
  v_me_phone text;
  v_me_referred_by uuid;
  v_owner_is_pro boolean;
  v_jobs integer;
begin
  if uid is null then raise exception 'Debes entrar primero.'; end if;
  select * into s from public.referral_settings where id;
  if not s.enabled then raise exception 'El programa de referidos no está disponible.'; end if;
  if p_track not in ('client', 'pro') then raise exception 'Tipo de referido no válido.'; end if;

  select id, phone into v_owner_id, v_owner_phone
    from public.profiles where referral_code = upper(btrim(coalesce(p_code, '')));
  if v_owner_id is null then raise exception 'Ese código no existe.'; end if;
  if v_owner_id = uid then raise exception 'No puedes usar tu propio código.'; end if;

  select phone, referred_by into v_me_phone, v_me_referred_by from public.profiles where id = uid;
  if v_me_referred_by is not null or exists (select 1 from public.referrals where referee_id = uid) then
    raise exception 'Tu cuenta ya tiene un referido.';
  end if;
  if v_me_phone is not null and v_me_phone = v_owner_phone then
    raise exception 'No puedes usar tu propio código.';
  end if;

  v_owner_is_pro := exists (select 1 from public.pros where id = v_owner_id);
  if v_owner_is_pro and p_track = 'client' then
    raise exception 'Este código es para profesionales. Regístrate desde la página de profesionales.';
  end if;
  if not v_owner_is_pro and p_track = 'pro' then
    raise exception 'Este código es para clientes.';
  end if;

  select count(*) into v_jobs from public.jobs where homeowner_id = uid;
  if v_jobs > 0 or exists (select 1 from public.pros where id = uid) then
    raise exception 'Solo las cuentas nuevas pueden usar un código de referido.';
  end if;

  perform set_config('listavy.referral_write', 'on', true);
  insert into public.referrals (referrer_id, referee_id, track) values (v_owner_id, uid, p_track);
  update public.profiles set referred_by = v_owner_id where id = uid;
  perform set_config('listavy.referral_write', 'off', true);
end;
$$;

create or replace function public.referral_grant_on_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_settings;
  j record;
  r record;
begin
  if new.purpose <> 'job' or new.status <> 'released' or old.status = 'released' then return new; end if;
  select * into s from public.referral_settings where id;
  if not s.enabled then return new; end if;

  select id, homeowner_id, pro_id into j from public.jobs where id = new.job_id;
  for r in
    select rf.* from public.referrals rf
     where rf.status = 'pending'
       and ((rf.track = 'client' and rf.referee_id = j.homeowner_id)
         or (rf.track = 'pro' and rf.referee_id = j.pro_id))
     for update
  loop
    update public.referrals
       set status = 'granted', granted_at = now(), qualifying_payment_id = new.id
     where id = r.id;
    if r.track = 'client' then
      insert into public.client_credits (profile_id, referral_id, amount_dop, expires_at)
        values (r.referrer_id, r.id, s.referrer_credit_dop, now() + make_interval(days => s.credit_expiry_days));
    else
      perform set_config('listavy.pro_internal', 'on', true);
      update public.pros
         set pro_free_until = greatest(coalesce(pro_free_until, now()), now()) + make_interval(days => s.pro_free_days)
       where id = r.referrer_id;
      perform set_config('listavy.pro_internal', 'off', true);
    end if;
  end loop;
  return new;
end;
$$;
