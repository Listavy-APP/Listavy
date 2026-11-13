-- 0037: boost refunds. Stores the Stripe amount and FX on each boost, adds the pro-rata refund
-- calculation (admin only), and the refund record (service role only).
-- Applied to the project after 0036. The bodies below are the applied definitions.

alter table public.boosts
  add column if not exists amount_minor bigint check (amount_minor is null or amount_minor > 0),
  add column if not exists fx_rate_dop_per_usd numeric(10, 4),
  add column if not exists refund_stripe_id text;

-- Store the Stripe amount and FX on every boost, for exact refunds.
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
  insert into public.stripe_events (id, type, livemode)
    values (p_event_id, p_event_type, p_livemode)
    on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  if exists (select 1 from public.boosts where stripe_checkout_session_id = p_session_id) then
    update public.stripe_events set processed_at = now() where id = p_event_id;
    return 'duplicate';
  end if;

  if (p_duration_days = 7 and p_amount_dop <> 500)
     or (p_duration_days = 30 and p_amount_dop <> 1500)
     or p_duration_days not in (7, 30) then
    raise exception 'Precio de promoción no válido.';
  end if;

  select id, verification_status, suspended_at into v_pro
    from public.pros where id = p_pro for update;
  if not found then raise exception 'Profesional no encontrado.'; end if;

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
      stripe_checkout_session_id, stripe_payment_intent_id, amount_minor, fx_rate_dop_per_usd
    ) values (
      p_pro, p_duration_days, p_amount_dop, 'refund_due', v_reason, v_now,
      v_now + make_interval(days => p_duration_days),
      p_session_id, p_payment_intent_id, p_amount_minor, p_fx
    );
    update public.stripe_events set processed_at = now() where id = p_event_id;
    return 'refund_due';
  end if;

  insert into public.boosts (
    pro_id, duration_days, amount_dop, status, starts_at, ends_at,
    stripe_checkout_session_id, stripe_payment_intent_id, amount_minor, fx_rate_dop_per_usd
  ) values (
    p_pro, p_duration_days, p_amount_dop, 'active', v_now,
    v_now + make_interval(days => p_duration_days),
    p_session_id, p_payment_intent_id, p_amount_minor, p_fx
  );
  update public.stripe_events set processed_at = now() where id = p_event_id;

  return 'applied';
end;
$function$;

revoke all on function public.apply_boost_checkout(text, text, boolean, uuid, text, text, integer, integer, bigint, numeric) from public, anon, authenticated;

-- Refund owed for one boost, in DOP. Admin only.
-- refund_due: the full amount. Blocked or suspended pro, active boost: the unused whole days, pro-rata.
create or replace function public.boost_refund_dop(p_boost uuid)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  b record;
  v_suspended boolean;
  v_days integer;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede calcular reembolsos.'; end if;

  select * into b from public.boosts where id = p_boost;
  if not found then raise exception 'Destacado no encontrado.'; end if;

  if b.status = 'refund_due' then return b.amount_dop; end if;
  if b.status not in ('active', 'paused') then
    raise exception 'Este destacado ya no se puede reembolsar.';
  end if;

  select (p.suspended_at is not null or p.verification_status = 'suspended') into v_suspended
    from public.pros p where p.id = b.pro_id;
  if not coalesce(v_suspended, false) then
    raise exception 'Solo se reembolsa un destacado activo si el profesional está bloqueado o suspendido.';
  end if;

  v_days := greatest(0, floor(extract(epoch from (b.ends_at - now())) / 86400))::integer;
  return floor(b.amount_dop * v_days / b.duration_days)::integer;
end;
$$;

revoke all on function public.boost_refund_dop(uuid) from public, anon;
grant execute on function public.boost_refund_dop(uuid) to authenticated;

-- Records a refund after Stripe accepted it. Service role only (called by process-boost-refund).
create or replace function public.mark_boost_refunded(p_boost uuid, p_refund_dop integer, p_stripe_refund text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  b record;
begin
  select * into b from public.boosts where id = p_boost for update;
  if not found then raise exception 'Destacado no encontrado.'; end if;
  if b.status = 'refunded' then return 'already'; end if;
  update public.boosts set
    status = 'refunded',
    refund_amount_dop = p_refund_dop,
    refund_stripe_id = p_stripe_refund,
    refunded_at = now()
  where id = p_boost;
  return 'refunded';
end;
$$;

revoke all on function public.mark_boost_refunded(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.mark_boost_refunded(uuid, integer, text) to service_role;
