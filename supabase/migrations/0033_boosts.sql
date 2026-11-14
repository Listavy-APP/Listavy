-- 0033 Promoted profile ("Destacado"). Separate from job payments (Option A).
-- A boost is a paid placement of an approved pro in the "Destacados" group on /buscar.
-- Price: 7 days RD$500, 30 days RD$1,500. Max 3 boosted pros are shown, ordered by starts_at desc.
-- Job payments, release, refund and dispute logic are not touched by this migration.

-- 1. Boosts table with its own payment record. ----------------------------------------
create table if not exists public.boosts (
  id                       uuid primary key default gen_random_uuid(),
  pro_id                   uuid not null references public.pros (id),
  duration_days            integer not null check (duration_days in (7, 30)),
  amount_dop               integer not null check (amount_dop > 0),
  status                   text not null default 'active'
                           check (status in ('active', 'expired', 'paused', 'refunded', 'refund_due')),
  -- Set when a paid boost could not be activated (race, block, or no longer eligible).
  -- Admin refunds these. The payment is recorded; nothing is retried or lost.
  flag_reason              text,
  starts_at                timestamptz not null default now(),
  ends_at                  timestamptz not null,
  paused_at                timestamptz,
  refunded_at              timestamptz,
  refund_amount_dop        integer check (refund_amount_dop is null or refund_amount_dop >= 0),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  created_at               timestamptz not null default now(),
  constraint boosts_price_matches_duration check (
    (duration_days = 7 and amount_dop = 500) or (duration_days = 30 and amount_dop = 1500)
  ),
  constraint boosts_ends_after_start check (ends_at > starts_at)
);

-- One active boost per pro. A paused boost also counts as the pro's current boost.
create unique index if not exists boosts_one_live_per_pro
  on public.boosts (pro_id) where status in ('active', 'paused');

create index if not exists boosts_discovery_idx
  on public.boosts (starts_at desc) where status = 'active';

alter table public.boosts enable row level security;

-- Pro reads own boosts. Admin reads all. Writes happen only through security definer functions.
drop policy if exists boosts_select_own on public.boosts;
create policy boosts_select_own on public.boosts
  for select using (pro_id = (select auth.uid()) or public.is_admin());

revoke insert, update, delete on public.boosts from authenticated, anon;

-- 2. Idempotent webhook apply. Same event-id pattern as apply_stripe_checkout. ---------
create or replace function public.apply_boost_checkout(
  p_event_id text, p_event_type text, p_livemode boolean, p_pro uuid,
  p_session_id text, p_payment_intent_id text,
  p_duration_days integer, p_amount_dop integer, p_amount_minor bigint, p_fx numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pro record;
  v_now timestamptz := now();
  v_reason text;
begin
  -- Idempotency. A repeated event id is a no-op, and a failure below rolls this row back too.
  insert into public.stripe_events (id, type, livemode)
    values (p_event_id, p_event_type, p_livemode)
    on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  -- Replay of the same checkout session under a new event id.
  if exists (select 1 from public.boosts where stripe_checkout_session_id = p_session_id) then
    return 'duplicate';
  end if;

  -- Price must match the approved tier. A mismatch is a bug, so it fails loudly (500, Stripe retries).
  if (p_duration_days = 7 and p_amount_dop <> 500)
     or (p_duration_days = 30 and p_amount_dop <> 1500)
     or p_duration_days not in (7, 30) then
    raise exception 'Precio de promoción no válido.';
  end if;

  select id, verification_status, suspended_at into v_pro
    from public.pros where id = p_pro for update;
  if not found then raise exception 'Profesional no encontrado.'; end if;

  -- The payment is already taken. If the boost cannot activate, record it for an admin refund
  -- instead of raising. A raise would make Stripe retry forever with the money held.
  if v_pro.verification_status <> 'approved' then
    v_reason := 'not_approved';
  elsif v_pro.suspended_at is not null then
    v_reason := 'blocked';
  elsif exists (select 1 from public.boosts b where b.pro_id = p_pro and b.status in ('active', 'paused')) then
    v_reason := 'already_boosted';
  end if;

  if v_reason is not null then
    insert into public.boosts (
      pro_id, duration_days, amount_dop, status, flag_reason, starts_at, ends_at,
      stripe_checkout_session_id, stripe_payment_intent_id
    ) values (
      p_pro, p_duration_days, p_amount_dop, 'refund_due', v_reason, v_now,
      v_now + make_interval(days => p_duration_days),
      p_session_id, p_payment_intent_id
    );
    return 'refund_due';
  end if;

  insert into public.boosts (
    pro_id, duration_days, amount_dop, status, starts_at, ends_at,
    stripe_checkout_session_id, stripe_payment_intent_id
  ) values (
    p_pro, p_duration_days, p_amount_dop, 'active', v_now,
    v_now + make_interval(days => p_duration_days),
    p_session_id, p_payment_intent_id
  );

  return 'applied';
end;
$function$;

revoke all on function public.apply_boost_checkout(text, text, boolean, uuid, text, text, integer, integer, bigint, numeric) from public, anon, authenticated;

-- 3. Eligibility for the pro's "Destacar mi perfil" button. Counts and flags only. ------
create or replace function public.boost_eligibility()
returns table (eligible boolean, reason text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pro record;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para destacar tu perfil.';
  end if;

  select verification_status, suspended_at into v_pro
    from public.pros where id = (select auth.uid());
  if not found or v_pro.verification_status <> 'approved' then
    return query select false, 'not_approved'::text;
    return;
  end if;
  if v_pro.suspended_at is not null then
    return query select false, 'blocked'::text;
    return;
  end if;
  if exists (
    select 1 from public.boosts b
     where b.pro_id = (select auth.uid()) and b.status in ('active', 'paused')
  ) then
    return query select false, 'already_boosted'::text;
    return;
  end if;
  return query select true, 'ok'::text;
end;
$$;

revoke all on function public.boost_eligibility() from public, anon;
grant execute on function public.boost_eligibility() to authenticated;

-- 4. Public discovery: up to 3 active boosts, most recent start first. ---------------
-- Returns only pro ids. The /buscar page joins the public pro card for each id.
create or replace function public.boosted_pro_ids()
returns table (pro_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.pro_id, b.starts_at
    from public.boosts b
    join public.pros p on p.id = b.pro_id
   where b.status = 'active'
     and b.ends_at > now()
     and p.verification_status = 'approved'
     and p.suspended_at is null
   order by b.starts_at desc
   limit 3;
$$;

revoke all on function public.boosted_pro_ids() from public, anon;
grant execute on function public.boosted_pro_ids() to authenticated, anon;
