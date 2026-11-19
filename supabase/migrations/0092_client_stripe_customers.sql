-- Listavy · 0092 · Stripe Customer per client, for saved cards (build queue item 6).
-- NOT APPLIED. Sam reviews, then Fabian approves. Applied before the stripe-checkout function that reads it ships.
--
-- Why: a client's card is saved to a Stripe Customer. The Customer id is internal. It is never returned
-- to a browser, so no public select, RPC or view exposes it (see the 0086 allowlist lesson).
--
-- Design:
--   * One row per (client, Stripe mode). A test customer never serves live payments after the cutover.
--   * Created lazily, on the job checkout path only. Never at signup.
--   * RLS on, no policies, and no grant to anon or authenticated. Only service_role (Edge Functions) reads
--     or writes this table. A client cannot read their own row through the API.
--   * The Stripe customer id is unique across rows, so one Stripe customer can belong to one row only.

create table public.client_stripe_customers (
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  stripe_mode        text not null check (stripe_mode in ('test', 'live')),
  stripe_customer_id text not null unique check (stripe_customer_id like 'cus\_%'),
  created_at         timestamptz not null default now(),
  primary key (profile_id, stripe_mode)
);

alter table public.client_stripe_customers enable row level security;

revoke all on public.client_stripe_customers from public, anon, authenticated;
grant select, insert, delete on public.client_stripe_customers to service_role;
