-- Sprint 3 (money), TEST mode. Payment rows are written only by the service role
-- (Stripe webhook Edge Function). Clients keep READ-ONLY access from 0001.

-- 1. Money fields on payments. Amounts in whole pesos for commission math; minor units for Stripe.
alter table public.payments
  add column if not exists amount_dop         integer check (amount_dop is null or amount_dop > 0),
  add column if not exists pro_payout_dop     integer check (pro_payout_dop is null or pro_payout_dop >= 0),
  add column if not exists tip_dop            integer not null default 0 check (tip_dop >= 0),
  add column if not exists purpose            text not null default 'job'
                                              check (purpose in ('job', 'diagnostic', 'revision', 'tip')),
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id   text unique,
  add column if not exists stripe_transfer_id         text unique,
  add column if not exists held_at            timestamptz,
  add column if not exists release_after      timestamptz,
  add column if not exists released_at        timestamptz,
  add column if not exists refunded_minor     bigint not null default 0 check (refunded_minor >= 0);

-- Pro payout plus commission must equal the job amount. Tips are outside this split (0% commission).
alter table public.payments
  add constraint payments_split_consistent
  check (amount_dop is null or pro_payout_dop is null or commission_dop is null
         or pro_payout_dop + commission_dop = amount_dop);

-- 2. Webhook idempotency. One row per Stripe event id. Service role only.
create table if not exists public.stripe_events (
  id           text primary key,            -- Stripe event id (evt_...)
  type         text not null,
  livemode     boolean not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_events enable row level security;
-- No policies: clients have no access. The service role bypasses RLS.
revoke all on public.stripe_events from anon, authenticated;

-- 3. Provider and currency are already stored on every payment (0001). Keep them explicit.
comment on column public.payments.provider is 'PaymentProvider key. Stripe in Sprint 3; Azul later.';
