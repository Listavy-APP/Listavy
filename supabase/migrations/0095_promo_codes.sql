-- 0095: promo codes for job payments (client discount). Platform-funded.
-- NOT APPLIED. Sam reviews, then Fabian approves.
--
-- Scope: job-payment checkouts (purposes 'job' and 'diagnostic'). Not tips, not Pro plan, not boosts.
-- Discount base: the job amount after any diagnostic credit, before tip. Tip is never discounted.
--   percent: discount = round half up(base * pct / 100)
--   fixed:   discount = min(value, base)
--   floor:   discount <= base - 100, so the client always pays at least RD$100 of the job.
--   A base of RD$100 or less cannot take a code.
-- Platform-funded: commission and pro payout use the amount BEFORE the discount, as the referral discount does.
--   payments_split_consistent: pro_payout + commission = amount + referral_discount + discount.
-- No stacking: a promo code and the referral discount cannot both apply to one job.
--   Enforced in promo_check() (refuses when a referral discount is reserved or recorded for the job)
--   and in reserve_referral_discount() (returns 0 when a promo reservation is live for the job).
-- Lifecycle: preview_promo_code() reserves nothing. reserve_promo_code() reserves, called by stripe-checkout
--   before the Checkout Session. release_promo_reservation() undoes it when session creation fails.
--   apply_stripe_checkout() marks the reservation redeemed and writes the discount onto the payment.
--   A reservation with no payment after 2 hours is stale. Reserve releases stale ones for that code.
--   Checkout sessions expire after 110 minutes (stripe-checkout), inside the stale window.
--
-- Access: promo_codes and promo_redemptions have RLS on and no client policies. Admin reads and writes go
-- through SECURITY DEFINER functions gated by is_admin(). Reserve, release and apply are service role only.

-- 1. Codes.
create table if not exists public.promo_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique
                   check (code = upper(btrim(code)) and code ~ '^[A-Z0-9]{4,20}$'),
  kind             text not null check (kind in ('percent', 'fixed')),
  value            integer not null check (value > 0),
  check (kind <> 'percent' or value <= 100),
  starts_at        timestamptz,
  expires_at       timestamptz,
  check (starts_at is null or expires_at is null or expires_at > starts_at),
  max_redemptions  integer check (max_redemptions is null or max_redemptions > 0),
  active           boolean not null default true,
  note             text check (note is null or char_length(note) <= 200),
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);

-- 2. Ledger: the discount and the code on each payment row.
alter table public.payments add column if not exists discount_dop integer not null default 0
  check (discount_dop >= 0);
alter table public.payments add column if not exists promo_code_id uuid references public.promo_codes (id);

-- 3. Redemptions. One row per reservation attempt that reached a session.
create table if not exists public.promo_redemptions (
  id            uuid primary key default gen_random_uuid(),
  promo_id      uuid not null references public.promo_codes (id),
  client_id     uuid not null references public.profiles (id),
  job_id        uuid not null references public.jobs (id),
  payment_id    uuid references public.payments (id),
  status        text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  discount_dop  integer not null check (discount_dop > 0),
  created_at    timestamptz not null default now(),
  redeemed_at   timestamptz,
  check (status <> 'redeemed' or (payment_id is not null and redeemed_at is not null))
);
-- At most one live (reserved or redeemed) use of a code per client.
create unique index if not exists promo_redemptions_one_live_per_client
  on public.promo_redemptions (promo_id, client_id) where status in ('reserved', 'redeemed');
-- At most one live reservation per job.
create unique index if not exists promo_redemptions_one_reserved_per_job
  on public.promo_redemptions (job_id) where status = 'reserved';

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_codes from public, anon, authenticated;
revoke all on public.promo_redemptions from public, anon, authenticated;

-- 4. Split identity includes the promo discount. Same rule as the referral discount.
alter table public.payments drop constraint if exists payments_split_consistent;
alter table public.payments add constraint payments_split_consistent
  check (amount_dop is null or pro_payout_dop is null or commission_dop is null
         or pro_payout_dop + commission_dop = amount_dop + referral_discount_dop + discount_dop);

alter table public.payments drop constraint if exists payments_keep_split_consistent;
alter table public.payments add constraint payments_keep_split_consistent
  check (keep_dop is null
         or (keep_pro_payout_dop + keep_commission_dop) = (keep_dop + referral_discount_dop + discount_dop));

-- 5. Internal helpers. Called only from the definer functions below. No client grant.
create or replace function public.promo_job_base(p_job uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j record;
  v_quote integer;
  v_credit integer := 0;
begin
  select job_type, credit_from_job_id, approved_quote_id into j from public.jobs where id = p_job;
  if not found or j.approved_quote_id is null then return null; end if;
  select amount_dop into v_quote from public.quotes where id = j.approved_quote_id;
  if j.job_type = 'diagnostic' then return v_quote; end if;
  if j.credit_from_job_id is not null then
    select amount_dop into v_credit from public.payments
     where job_id = j.credit_from_job_id and purpose = 'diagnostic' and status in ('held', 'released')
     limit 1;
    v_credit := coalesce(v_credit, 0);
  end if;
  return greatest(0, v_quote - v_credit);
end;
$$;

create or replace function public.promo_discount_for(p_kind text, p_value integer, p_base integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0, least(
    case when p_kind = 'percent'
         then floor((p_base::numeric * p_value * 2 + 100) / 200)::integer  -- half up to the peso
         else p_value end,
    p_base - 100));                                                      -- client always pays at least RD$100
$$;

-- Every check, in order. Raises the first failure with its Spanish message. Returns the discount when all pass.
create or replace function public.promo_check(p_promo_code text, p_job uuid, p_client uuid)
returns table (promo_id uuid, discount_dop integer, base_dop integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.promo_codes;
  v_base integer;
  v_discount integer;
  v_now timestamptz := now();
begin
  select * into p from public.promo_codes where code = upper(btrim(coalesce(p_promo_code, '')));
  if not found then raise exception 'Ese código no existe.'; end if;
  if not p.active then raise exception 'Este código no está activo.'; end if;
  if p.starts_at is not null and p.starts_at > v_now then raise exception 'Este código todavía no está vigente.'; end if;
  if p.expires_at is not null and p.expires_at <= v_now then raise exception 'Este código ya venció.'; end if;

  if p.max_redemptions is not null and (
       select count(*) from public.promo_redemptions r
        where r.promo_id = p.id and r.job_id <> p_job
          and (r.status = 'redeemed' or (r.status = 'reserved' and r.created_at > v_now - interval '2 hours'))
     ) >= p.max_redemptions then
    raise exception 'Este código ya alcanzó su límite de usos.';
  end if;

  if exists (
       select 1 from public.promo_redemptions r
        where r.promo_id = p.id and r.client_id = p_client and r.job_id <> p_job
          and (r.status = 'redeemed' or (r.status = 'reserved' and r.created_at > v_now - interval '2 hours'))
     ) then
    raise exception 'Ya usaste este código.';
  end if;

  -- No stacking: a referral discount reserved for this job, or recorded on any of its payments.
  if public.referral_discount_reserved(p_job) > 0
     or exists (select 1 from public.payments pm where pm.job_id = p_job and pm.referral_discount_dop > 0) then
    raise exception 'Este código no se puede combinar con otro descuento de este trabajo.';
  end if;

  v_base := public.promo_job_base(p_job);
  if v_base is null then raise exception 'El trabajo no tiene cotización aprobada.'; end if;
  v_discount := public.promo_discount_for(p.kind, p.value, v_base);
  if v_discount <= 0 then raise exception 'El monto del trabajo es muy bajo para este código.'; end if;

  return query select p.id, v_discount, v_base;
end;
$$;

-- 6. Client preview ("Aplicar"). Reserves nothing. Only the job's homeowner, only a payable job.
create or replace function public.preview_promo_code(p_job uuid, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j record;
  r record;
begin
  if auth.uid() is null then raise exception 'No autorizado.'; end if;
  select homeowner_id, status, payment_status into j from public.jobs where id = p_job;
  if not found or j.homeowner_id <> auth.uid() then raise exception 'No autorizado.'; end if;
  if j.status <> 'accepted' or j.payment_status <> 'unpaid' then
    raise exception 'El trabajo no está listo para pago.';
  end if;
  select * into r from public.promo_check(p_code, p_job, auth.uid());
  return jsonb_build_object('discount_dop', r.discount_dop, 'base_dop', r.base_dop);
end;
$$;

-- 7. Reserve (service role). Called by stripe-checkout before the Checkout Session is created.
create or replace function public.reserve_promo_code(p_job uuid, p_client uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_promo uuid;
begin
  -- A retry for this job replaces its earlier reservation.
  update public.promo_redemptions set status = 'released' where job_id = p_job and status = 'reserved';
  -- Stale reservations for this code (no payment after 2 hours) are released before counting.
  select id into v_promo from public.promo_codes where code = upper(btrim(coalesce(p_code, '')));
  if v_promo is not null then
    update public.promo_redemptions set status = 'released'
     where promo_id = v_promo and status = 'reserved' and created_at <= now() - interval '2 hours';
  end if;

  select * into r from public.promo_check(p_code, p_job, p_client);
  insert into public.promo_redemptions (promo_id, client_id, job_id, status, discount_dop)
    values (r.promo_id, p_client, p_job, 'reserved', r.discount_dop);
  return jsonb_build_object('promo_id', r.promo_id, 'discount_dop', r.discount_dop, 'base_dop', r.base_dop);
end;
$$;

-- 8. Release (service role). Called when session creation fails or the client drops the code.
create or replace function public.release_promo_reservation(p_job uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.promo_redemptions set status = 'released' where job_id = p_job and status = 'reserved';
$$;

-- 9. Admin: list, create, activate and deactivate. is_admin() gates every function.
create or replace function public.admin_list_promo_codes()
returns table (
  id uuid, code text, kind text, value integer, starts_at timestamptz, expires_at timestamptz,
  max_redemptions integer, active boolean, note text, created_at timestamptz,
  redeemed_count integer, reserved_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  return query
    select p.id, p.code, p.kind, p.value, p.starts_at, p.expires_at, p.max_redemptions, p.active, p.note, p.created_at,
           (select count(*)::integer from public.promo_redemptions r where r.promo_id = p.id and r.status = 'redeemed'),
           (select count(*)::integer from public.promo_redemptions r
             where r.promo_id = p.id and r.status = 'reserved' and r.created_at > now() - interval '2 hours')
      from public.promo_codes p
     order by p.created_at desc;
end;
$$;

create or replace function public.admin_create_promo_code(
  p_code text, p_kind text, p_value integer, p_starts_at timestamptz, p_expires_at timestamptz,
  p_max_redemptions integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  if v_code !~ '^[A-Z0-9]{4,20}$' then raise exception 'El código debe tener de 4 a 20 letras o números, sin espacios.'; end if;
  if p_kind not in ('percent', 'fixed') then raise exception 'Tipo de descuento no válido.'; end if;
  if p_kind = 'percent' and (p_value is null or p_value < 1 or p_value > 100) then
    raise exception 'El porcentaje debe estar entre 1 y 100.';
  end if;
  if p_kind = 'fixed' and (p_value is null or p_value < 1) then raise exception 'El monto fijo debe ser de al menos RD$1.'; end if;
  if p_starts_at is not null and p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'La fecha de vencimiento debe ser posterior al inicio.';
  end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then raise exception 'El límite de usos debe ser al menos 1.'; end if;

  insert into public.promo_codes (code, kind, value, starts_at, expires_at, max_redemptions, note, created_by)
    values (v_code, p_kind, p_value, p_starts_at, p_expires_at, p_max_redemptions,
            nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    returning promo_codes.id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ese código ya existe.';
end;
$$;

create or replace function public.admin_set_promo_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  update public.promo_codes set active = p_active where id = p_id;
  if not found then raise exception 'Código no encontrado.'; end if;
end;
$$;

-- 10. Grants.
revoke all on function public.promo_job_base(uuid) from public, anon, authenticated;
revoke all on function public.promo_discount_for(text, integer, integer) from public, anon, authenticated;
revoke all on function public.promo_check(text, uuid, uuid) from public, anon, authenticated;

revoke all on function public.preview_promo_code(uuid, text) from public, anon;
grant execute on function public.preview_promo_code(uuid, text) to authenticated;

revoke all on function public.reserve_promo_code(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_promo_code(uuid, uuid, text) to service_role;
revoke all on function public.release_promo_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_promo_reservation(uuid) to service_role;

revoke all on function public.admin_list_promo_codes() from public, anon;
grant execute on function public.admin_list_promo_codes() to authenticated;
revoke all on function public.admin_create_promo_code(text, text, integer, timestamptz, timestamptz, integer, text) from public, anon;
grant execute on function public.admin_create_promo_code(text, text, integer, timestamptz, timestamptz, integer, text) to authenticated;
revoke all on function public.admin_set_promo_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_promo_active(uuid, boolean) to authenticated;

-- 11. Redefined: stripe checkout apply now writes the promo discount and redeems the reservation (base 0040).
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
  v_redemption uuid;
  v_promo uuid;
  v_promo_dop integer := 0;
  v_payment uuid;
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

  -- Promo code reserved for this job (0095). At most one live reservation per job.
  select pr.id, pr.promo_id, pr.discount_dop into v_redemption, v_promo, v_promo_dop
    from public.promo_redemptions pr where pr.job_id = p_job and pr.status = 'reserved' limit 1;
  v_promo_dop := coalesce(v_promo_dop, 0);
  v_expected := greatest(0, v_expected - v_promo_dop);

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
    stripe_checkout_session_id, stripe_payment_intent_id, held_at, referral_discount_dop,
    discount_dop, promo_code_id
  ) values (
    p_job, 'stripe', 'USD', p_amount_minor, p_fx, p_commission_dop,
    'held', p_amount_dop, p_pro_payout_dop, p_tip_dop, p_purpose,
    p_session_id, p_payment_intent_id, now(), v_discount,
    v_promo_dop, v_promo
  ) returning id into v_payment;

  if v_redemption is not null then
    update public.promo_redemptions set status = 'redeemed', payment_id = v_payment, redeemed_at = now()
     where id = v_redemption;
  end if;

  if v_discount > 0 then perform public.referral_consume_reservation(p_job); end if;
  update public.jobs set payment_status = 'paid' where id = p_job;
  update public.stripe_events set processed_at = now() where id = p_event_id;
  return 'applied';
end;
$function$;

-- 12. Redefined: referral reserve refuses when a promo reservation is live for the job (base 0040).
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

  -- A promo code reserved for this job excludes the referral discount (0095).
  if exists (select 1 from public.promo_redemptions where job_id = p_job and status = 'reserved') then return 0; end if;

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

-- 13. Redefined: dispute quote basis includes the promo discount (base 0064). Same rule as referral.
create or replace function public.resolve_dispute(p_dispute uuid, p_outcome text, p_refund_dop integer default null::integer, p_reason text default null::text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  d record;
  p record;
  j record;
  v_pro uuid;
  v_plan text;
  v_rate integer;
  v_refund_dop integer;
  v_refund_minor bigint;
  v_kept_dop integer;
  v_kept_minor bigint;
  v_quote integer;
  v_kept_quote integer;
  v_kept_comm integer;
  v_kept_payout integer;
  v_balance bigint;
  v_other uuid;
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede resolver una disputa.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe la razón de la decisión (mínimo 10 caracteres).';
  end if;

  select * into d from public.disputes where id = p_dispute for update;
  if not found then raise exception 'Disputa no encontrada.'; end if;
  if d.status <> 'open' or d.stage <> 'evidence' then raise exception 'La disputa ya fue decidida.'; end if;
  if now() < d.evidence_due_at then raise exception 'La ventana de evidencia aún no vence.'; end if;

  select * into p from public.payments where id = d.payment_id for update;
  select * into j from public.jobs where id = d.job_id;
  v_pro := j.pro_id;
  select plan into v_plan from public.pros where id = v_pro;

  if d.phase = 'pre_release' then
    if p.status <> 'disputed' then raise exception 'El pago no está congelado.'; end if;

    if p_outcome = 'release_full' then
      update public.payments set status = 'held' where id = p.id;

    elsif p_outcome = 'full_refund' then
      v_refund_dop := p.amount_dop;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, p.amount_minor, 'dispute_full', d.id);

    elsif p_outcome = 'partial_refund' then
      if p_refund_dop is null or p_refund_dop <= 0 or p_refund_dop >= p.amount_dop then
        raise exception 'El reembolso parcial debe ser mayor que cero y menor que el monto del trabajo.';
      end if;
      v_refund_dop := p_refund_dop;
      v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
      -- Client's kept cash (charged basis).
      v_kept_dop := p.amount_dop - v_refund_dop;
      v_kept_minor := p.amount_minor - v_refund_minor;
      -- Quote basis: the referral discount is part of the job price the pro earns on.
      v_quote := p.amount_dop + (coalesce(p.referral_discount_dop, 0) + coalesce(p.discount_dop, 0));
      v_kept_quote := v_kept_dop + (coalesce(p.referral_discount_dop, 0) + coalesce(p.discount_dop, 0));

      v_rate := case
        when j.job_type = 'diagnostic' then 15
        when v_plan = 'pro' then 8
        when v_quote < 5000 then 15
        when v_quote <= 25000 then 12
        else 10
      end;
      v_kept_comm := floor((v_kept_quote * v_rate * 2 + 100) / 200);
      if j.job_type = 'repair' and v_plan <> 'pro' and v_kept_comm < 400 then
        v_kept_comm := 400;
      end if;
      if j.job_type = 'repair' and v_kept_comm > 15000 then
        v_kept_comm := 15000;
      end if;
      v_kept_comm := least(v_kept_comm, v_kept_quote);
      v_kept_payout := v_kept_quote - v_kept_comm;

      update public.payments
         set keep_dop = v_kept_dop,
             keep_minor = v_kept_minor,
             keep_pro_payout_dop = v_kept_payout,
             keep_commission_dop = v_kept_comm
       where id = p.id;
      insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
      values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'dispute_partial', d.id);

    elsif p_outcome = 'redo' then
      null;

    else
      raise exception 'Resultado no válido.';
    end if;

  else
    if p.status <> 'released' then raise exception 'El pago ya no está liberado.'; end if;
    if p_outcome = 'full_refund' then
      v_refund_dop := p.amount_dop;
    elsif p_outcome = 'partial_refund' then
      v_refund_dop := p_refund_dop;
    else
      raise exception 'Después de la liberación solo hay reembolso desde la reserva.';
    end if;
    if v_refund_dop is null or v_refund_dop <= 0 or v_refund_dop > p.amount_dop then
      raise exception 'El reembolso excede el monto del trabajo.';
    end if;

    lock table public.guarantee_reserve in share row exclusive mode;
    select coalesce(sum(case when entry_kind = 'funding' then amount_dop else -amount_dop end), 0)
      into v_balance from public.guarantee_reserve;
    if v_balance < v_refund_dop then raise exception 'Reserva de garantía insuficiente.'; end if;

    v_refund_minor := round(p.amount_minor::numeric * v_refund_dop / p.amount_dop)::bigint;
    insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id)
    values (p.id, d.job_id, v_refund_dop, v_refund_minor, 'guarantee_refund', d.id);
    insert into public.pro_recoveries (pro_id, dispute_id, amount_dop)
    values (v_pro, d.id, v_refund_dop);
  end if;

  update public.disputes
     set decided_at = now(),
         decided_by = (select auth.uid()),
         decision_reason = trim(p_reason),
         outcome = p_outcome,
         refund_dop = v_refund_dop,
         stage = case when p_outcome = 'redo' then 'decided' else 'executed' end
   where id = d.id;

  -- Audit: one row per decision, in the Bitácora (admin_audit_log via admin_log).
  -- keep = charged amount minus refund. Redo keeps the full amount on hold until the redo is approved.
  perform public.admin_log(
    'dispute_decided',
    d.id,
    jsonb_build_object(
      'dispute_id', d.id,
      'payment_id', d.payment_id,
      'job_id', d.job_id,
      'phase', d.phase,
      'outcome', case p_outcome
                   when 'release_full' then 'release'
                   when 'partial_refund' then 'partial_refund'
                   when 'full_refund' then 'full_refund'
                   when 'redo' then 'redo'
                 end,
      'outcome_raw', p_outcome,
      'refund_dop', coalesce(v_refund_dop, 0),
      'keep_dop', p.amount_dop - coalesce(v_refund_dop, 0),
      'reason', trim(p_reason)
    )
  );

  if p_outcome = 'redo' then
    return 'redo_pending';
  end if;

  update public.disputes
     set status = case when p_outcome = 'release_full' then 'resolved_pro' else 'resolved_homeowner' end,
         resolved_at = now()
   where id = d.id;

  insert into public.dispute_notifications (dispute_id, recipient_id, kind, body)
  select d.id, x, 'decision', 'La disputa fue decidida. Motivo: ' || trim(p_reason) || ' Esta decisión es final en la plataforma.'
    from unnest(array[j.homeowner_id, j.pro_id]) as x
   where x is not null;

  return 'resolved';
end;
$function$;
