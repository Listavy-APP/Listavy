-- 0040 · Referral promo ("Invita y gana").
-- Ships OFF. referral_settings.enabled = false makes every function here a no-op, so payments,
-- releases and approvals behave as before until an admin flips the flag after the smoke test
-- and the lawyer's review of the promo terms.
--
-- Money rules (see stripe-checkout/commission.ts):
--   * The client pays quote - diagnostic credit - referral discount (+ tip).
--   * The pro is paid on the full quote, less the normal tier commission. Never reduced.
--   * payments.referral_discount_dop is the amount Listavy funds. The split becomes
--     pro_payout + commission = amount + referral_discount.
--   * Discounted payouts are sent from the platform balance (release-payments), not from the charge.
--
-- Reservations: a discount or credit is reserved at checkout creation for one job (24 h). It is
-- consumed only when the webhook records the payment, so two jobs cannot share one reward.

-- 1. Settings. Singleton. Read only by security definer functions.
create table if not exists public.referral_settings (
  id                  boolean primary key default true check (id),
  enabled             boolean not null default false,
  friend_discount_dop integer not null default 500 check (friend_discount_dop > 0),
  referrer_credit_dop integer not null default 500 check (referrer_credit_dop > 0),
  min_job_dop         integer not null default 1500 check (min_job_dop > 0),
  credit_expiry_days  integer not null default 90 check (credit_expiry_days > 0),
  pro_free_days       integer not null default 30 check (pro_free_days > 0)
);
insert into public.referral_settings (id) values (true) on conflict (id) do nothing;
alter table public.referral_settings enable row level security;
revoke all on public.referral_settings from anon, authenticated;

-- 2. Columns.
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id);
alter table public.pros add column if not exists pro_free_until timestamptz;

alter table public.payments add column if not exists referral_discount_dop integer not null default 0
  check (referral_discount_dop >= 0);
alter table public.payments drop constraint if exists payments_split_consistent;
alter table public.payments add constraint payments_split_consistent
  check (amount_dop is null or pro_payout_dop is null or commission_dop is null
         or pro_payout_dop + commission_dop = amount_dop + referral_discount_dop);

-- 3. Referrals (one per referee).
create table if not exists public.referrals (
  id                      uuid primary key default gen_random_uuid(),
  referrer_id             uuid not null references public.profiles (id) on delete cascade,
  referee_id              uuid not null unique references public.profiles (id) on delete cascade,
  track                   text not null check (track in ('client', 'pro')),
  status                  text not null default 'pending' check (status in ('pending', 'granted', 'revoked')),
  reserved_job_id         uuid references public.jobs (id),
  reserved_until          timestamptz,
  reserved_amount_dop     integer,
  discount_job_id         uuid references public.jobs (id),
  discount_used_at        timestamptz,
  qualifying_payment_id   uuid references public.payments (id),
  granted_at              timestamptz,
  referee_pro_free_at     timestamptz,
  revoked_at              timestamptz,
  revoked_reason          text,
  created_at              timestamptz not null default now(),
  check (referrer_id <> referee_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- 4. Client credits (referrer reward, RD$ amounts, expire).
create table if not exists public.client_credits (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  referral_id         uuid not null unique references public.referrals (id) on delete cascade,
  amount_dop          integer not null check (amount_dop > 0),
  status              text not null default 'granted' check (status in ('granted', 'used', 'expired', 'revoked')),
  granted_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  reserved_job_id     uuid references public.jobs (id),
  reserved_until      timestamptz,
  reserved_amount_dop integer,
  used_job_id         uuid references public.jobs (id),
  used_at             timestamptz,
  revoked_at          timestamptz
);
create index if not exists client_credits_profile_idx on public.client_credits (profile_id, status);

alter table public.referrals enable row level security;
alter table public.client_credits enable row level security;
revoke all on public.referrals from anon, authenticated;
revoke all on public.client_credits from anon, authenticated;
grant select on public.referrals to authenticated;
grant select on public.client_credits to authenticated;

create policy referrals_select_party_or_admin on public.referrals for select to authenticated
  using (referrer_id = (select auth.uid()) or referee_id = (select auth.uid()) or public.is_admin());
create policy client_credits_select_owner_or_admin on public.client_credits for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

-- 5. Guards. Users cannot set the referral columns or pro_free_until. Internal writers set a
-- transaction-local flag. Admins are unaffected.
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
    if (new.referral_code is distinct from old.referral_code
        or new.referred_by is distinct from old.referred_by)
       and coalesce(current_setting('listavy.referral_write', true), '') <> 'on' then
      raise exception 'El código de referido lo asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.pro_free_until is distinct from old.pro_free_until
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'El mes gratis lo asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;

-- 6. Read the flag (anon and signed-in users, for the Home banner and the cuenta section).
create or replace function public.referral_program_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.referral_settings where id), false);
$$;
revoke all on function public.referral_program_enabled() from public;
grant execute on function public.referral_program_enabled() to anon, authenticated;

-- 7. Own referral code. Created on first request, unique, from the first name plus digits.
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
  return v_code;
end;
$$;
revoke all on function public.get_my_referral_code() from public, anon;
grant execute on function public.get_my_referral_code() to authenticated;

-- 8. Claim a code. Called once, before the first job (client) or the pro application (pro).
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

  -- New accounts only: no jobs and no pro application yet.
  select count(*) into v_jobs from public.jobs where homeowner_id = uid;
  if v_jobs > 0 or exists (select 1 from public.pros where id = uid) then
    raise exception 'Solo las cuentas nuevas pueden usar un código de referido.';
  end if;

  perform set_config('listavy.referral_write', 'on', true);
  insert into public.referrals (referrer_id, referee_id, track) values (v_owner_id, uid, p_track);
  update public.profiles set referred_by = v_owner_id where id = uid;
end;
$$;
revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

-- 9. Reservation (service role only). Called by stripe-checkout before a Checkout Session.
-- Returns the amount to take off this job's charge. 0 means no reward applies.
create or replace function public.reserve_referral_discount(p_job uuid, p_quote integer, p_before integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_settings;
  j record;
  r public.referrals;
  c public.client_credits;
  v_amount integer;
begin
  select * into s from public.referral_settings where id;
  if not s.enabled or p_before is null or p_before <= 1 then return 0; end if;

  select id, homeowner_id, job_type into j from public.jobs where id = p_job;
  if not found or j.job_type = 'diagnostic' then return 0; end if;

  -- Same job again (checkout retry): keep what is already reserved for it.
  select * into r from public.referrals where reserved_job_id = p_job and reserved_until > now() limit 1;
  if found then return r.reserved_amount_dop; end if;
  select * into c from public.client_credits where reserved_job_id = p_job and reserved_until > now() limit 1;
  if found then return c.reserved_amount_dop; end if;

  -- 1. Friend discount: the client's pending client-track referral, first repair job only.
  select * into r from public.referrals
   where referee_id = j.homeowner_id and track = 'client' and status = 'pending'
     and discount_job_id is null
     and (reserved_job_id is null or reserved_until <= now())
   limit 1 for update;
  if found and p_quote >= s.min_job_dop and not exists (
        select 1 from public.payments p join public.jobs jj on jj.id = p.job_id
         where jj.homeowner_id = j.homeowner_id and jj.id <> p_job and p.purpose = 'job'
           and p.status in ('held', 'released', 'disputed', 'refunded')) then
    v_amount := least(s.friend_discount_dop, p_before - 1);
    update public.referrals
       set reserved_job_id = p_job, reserved_until = now() + interval '1 day', reserved_amount_dop = v_amount
     where id = r.id;
    return v_amount;
  end if;

  -- 2. Referrer credit: oldest unexpired, unreserved credit.
  update public.client_credits set status = 'expired'
   where profile_id = j.homeowner_id and status = 'granted' and expires_at <= now();
  select * into c from public.client_credits
   where profile_id = j.homeowner_id and status = 'granted' and expires_at > now()
     and (reserved_job_id is null or reserved_until <= now())
   order by granted_at limit 1 for update;
  if found then
    v_amount := least(c.amount_dop, p_before - 1);
    update public.client_credits
       set reserved_job_id = p_job, reserved_until = now() + interval '1 day', reserved_amount_dop = v_amount
     where id = c.id;
    return v_amount;
  end if;

  return 0;
end;
$$;
revoke all on function public.reserve_referral_discount(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_referral_discount(uuid, integer, integer) to service_role;

-- 10. Amount reserved for a job (used by apply_stripe_checkout). Service role only.
create or replace function public.referral_discount_reserved(p_job uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select reserved_amount_dop from public.referrals where reserved_job_id = p_job limit 1),
    (select reserved_amount_dop from public.client_credits where reserved_job_id = p_job limit 1),
    0);
$$;
revoke all on function public.referral_discount_reserved(uuid) from public, anon, authenticated;
grant execute on function public.referral_discount_reserved(uuid) to service_role;

-- 11. Consume a reservation once the payment is recorded. Service role only.
create or replace function public.referral_consume_reservation(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.referrals
     set discount_job_id = p_job, discount_used_at = now(),
         reserved_job_id = null, reserved_until = null, reserved_amount_dop = null
   where reserved_job_id = p_job;
  update public.client_credits
     set status = 'used', used_job_id = p_job, used_at = now(),
         reserved_job_id = null, reserved_until = null, reserved_amount_dop = null
   where reserved_job_id = p_job and status = 'granted';
end;
$$;
revoke all on function public.referral_consume_reservation(uuid) from public, anon, authenticated;
grant execute on function public.referral_consume_reservation(uuid) to service_role;

-- 12. Release a reservation when the Checkout Session cannot be created. Service role only.
create or replace function public.release_referral_reservation(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.referrals set reserved_job_id = null, reserved_until = null, reserved_amount_dop = null
   where reserved_job_id = p_job;
  update public.client_credits set reserved_job_id = null, reserved_until = null, reserved_amount_dop = null
   where reserved_job_id = p_job and status = 'granted';
end;
$$;
revoke all on function public.release_referral_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_referral_reservation(uuid) to service_role;

-- 13. Webhook apply. Same as 0024, plus the reserved referral discount.
create or replace function public.apply_stripe_checkout(
  p_event_id text, p_event_type text, p_livemode boolean, p_job uuid, p_session_id text,
  p_payment_intent_id text, p_purpose text, p_amount_minor bigint, p_fx numeric,
  p_amount_dop integer, p_commission_dop integer, p_pro_payout_dop integer, p_tip_dop integer)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  j record;
  v_quote integer;
  v_credit integer;
  v_discount integer := 0;
  v_expected integer;
  v_tip_cap integer;
begin
  -- Idempotency. A repeated event id is a no-op, and a failure below rolls this row back too.
  insert into public.stripe_events (id, type, livemode)
    values (p_event_id, p_event_type, p_livemode)
    on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  if j.status <> 'accepted' or j.payment_status <> 'unpaid' then
    raise exception 'El trabajo no está listo para pago.';
  end if;
  if j.approved_quote_id is null then raise exception 'El trabajo no tiene cotización aprobada.'; end if;

  select amount_dop into v_quote from public.quotes where id = j.approved_quote_id;
  v_expected := v_quote;

  if j.credit_from_job_id is not null then
    select amount_dop into v_credit
      from public.payments
     where job_id = j.credit_from_job_id and purpose = 'diagnostic' and status in ('held', 'released')
     limit 1;
    if v_credit is null then raise exception 'El diagnóstico no tiene pago registrado.'; end if;
    v_expected := greatest(0, v_quote - v_credit);
  end if;

  v_discount := public.referral_discount_reserved(p_job);
  v_expected := greatest(0, v_expected - v_discount);

  if p_tip_dop is null or p_tip_dop < 0 then raise exception 'La propina no es válida.'; end if;
  -- Half-up 20% of the quote: floor((quote * 20 * 2 + 100) / 200).
  v_tip_cap := (v_quote * 40 + 100) / 200;
  if p_tip_dop > v_tip_cap then raise exception 'La propina supera el 20 por ciento del trabajo.'; end if;

  if p_amount_dop <> v_expected + p_tip_dop then
    raise exception 'El monto cobrado no coincide con la cotización menos el crédito y el descuento, más la propina.';
  end if;

  insert into public.payments (
    job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, commission_dop,
    status, amount_dop, pro_payout_dop, tip_dop, purpose,
    stripe_checkout_session_id, stripe_payment_intent_id, held_at, referral_discount_dop
  ) values (
    p_job, 'stripe', 'USD', p_amount_minor, p_fx, p_commission_dop,
    'held', p_amount_dop, p_pro_payout_dop, p_tip_dop, p_purpose,
    p_session_id, p_payment_intent_id, now(), v_discount
  );

  if v_discount > 0 then perform public.referral_consume_reservation(p_job); end if;
  update public.jobs set payment_status = 'paid' where id = p_job;
  update public.stripe_events set processed_at = now() where id = p_event_id;
  return 'applied';
end;
$function$;

-- 14. Grants on the referral triggers (AFTER release). Pays the referrer when the referee's first
-- repair payment is released. The payment is released only after the dispute window.
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
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.referral_grant_on_release() from public, anon, authenticated;

create trigger payments_referral_grant
  after update of status on public.payments
  for each row execute function public.referral_grant_on_release();

-- 15. Referee's free month at approval (BEFORE, so the new value is written in the same row update).
create or replace function public.referral_pro_free_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_settings;
  r public.referrals;
begin
  if new.verification_status <> 'approved' or old.verification_status = 'approved' then return new; end if;
  select * into s from public.referral_settings where id;
  if not s.enabled then return new; end if;

  select * into r from public.referrals
   where referee_id = new.id and track = 'pro' and status in ('pending', 'granted') and referee_pro_free_at is null
   limit 1 for update;
  if found then
    new.pro_free_until := greatest(coalesce(new.pro_free_until, now()), now()) + make_interval(days => s.pro_free_days);
    update public.referrals set referee_pro_free_at = now() where id = r.id;
  end if;
  return new;
end;
$$;
revoke all on function public.referral_pro_free_on_approval() from public, anon, authenticated;

create trigger pros_referral_pro_free
  before update of verification_status on public.pros
  for each row execute function public.referral_pro_free_on_approval();

-- 16. Admin: list is read through RLS (is_admin). Revoke is the only write. Manual, with a reason.
-- Revoking clears unused credits and any reservation. It does NOT claw back a free Pro month that
-- was already granted: the admin adjusts pros.pro_free_until by hand when needed.
create or replace function public.admin_revoke_referral(p_referral uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede revocar un referido.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'Escribe el motivo de la revocación.'; end if;

  update public.referrals
     set status = 'revoked', revoked_at = now(), revoked_reason = btrim(p_reason),
         reserved_job_id = null, reserved_until = null, reserved_amount_dop = null
   where id = p_referral and status <> 'revoked';
  if not found then raise exception 'Referido no encontrado o ya revocado.'; end if;

  update public.client_credits
     set status = 'revoked', revoked_at = now(),
         reserved_job_id = null, reserved_until = null, reserved_amount_dop = null
   where referral_id = p_referral and status = 'granted';
end;
$$;
revoke all on function public.admin_revoke_referral(uuid, text) from public, anon;
grant execute on function public.admin_revoke_referral(uuid, text) to authenticated;
