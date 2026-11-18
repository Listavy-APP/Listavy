-- 0087: release idempotency key version (queue item 2).
-- NOT APPLIED. Sam reviews, Fabian approves.
--
-- Problem: release-payments used one fixed Stripe Idempotency-Key per payment ("release_<payment id>").
-- Stripe replays a cached result, including a failure, for 24h+. A confirmed refusal (for example,
-- insufficient balance) therefore repeated on every retry for a day. Proven 2026-11-13.
--
-- Fix: a confirmed refusal bumps payments.release_key_version. The next attempt uses a new key version
-- (see _shared/payments/release-key.ts). Unknown outcomes keep the same key, so a double payout stays impossible.
-- Only a payment still in status 'held' can be bumped, and only from the version the run used.
-- Ceiling: the version never exceeds 5. At the ceiling the payment stays 'held' and visible in /admin/pagos.
-- No new alert mechanism.

alter table public.payments
  add column if not exists release_key_version integer not null default 1 check (release_key_version >= 1);

create or replace function public.bump_release_key_version(p_payment uuid, p_from_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.payments
     set release_key_version = release_key_version + 1
   where id = p_payment
     and status = 'held'
     and release_key_version = p_from_version
     and release_key_version < 5
  returning release_key_version into v_version;

  if v_version is null then
    -- Already bumped by an earlier run, or no longer held. Return the current value; no change.
    select release_key_version into v_version from public.payments where id = p_payment;
  end if;
  return v_version;
end;
$$;

revoke all on function public.bump_release_key_version(uuid, integer) from public, anon, authenticated;
grant execute on function public.bump_release_key_version(uuid, integer) to service_role;
