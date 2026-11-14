-- 0035: apply_boost_checkout sets stripe_events.processed_at on every path, as the job path does.
-- Applied to the project after 0034. The full function body below is the applied definition.

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
      stripe_checkout_session_id, stripe_payment_intent_id
    ) values (
      p_pro, p_duration_days, p_amount_dop, 'refund_due', v_reason, v_now,
      v_now + make_interval(days => p_duration_days),
      p_session_id, p_payment_intent_id
    );
    update public.stripe_events set processed_at = now() where id = p_event_id;
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
  update public.stripe_events set processed_at = now() where id = p_event_id;

  return 'applied';
end;
$function$;

revoke all on function public.apply_boost_checkout(text, text, boolean, uuid, text, text, integer, integer, bigint, numeric) from public, anon, authenticated;
