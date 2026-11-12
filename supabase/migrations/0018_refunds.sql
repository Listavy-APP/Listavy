-- Refunds, slice 1 (D4 automatic rows): client cancels after accept before work starts,
-- and pro cancels. Refund is 100% of the held payment, in USD at the original charge amount.
-- The platform absorbs the Stripe fee. Commission is not charged on refunded money.
-- Mediated refunds, disputes, and the guarantee reserve come in later slices.

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  job_id uuid not null references public.jobs(id),
  amount_dop integer not null check (amount_dop > 0),
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (reason in ('client_cancel_pre_work', 'pro_cancel')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  stripe_refund_id text unique,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- One open or completed refund per payment.
create unique index if not exists refunds_one_per_payment
  on public.refunds (payment_id) where status in ('pending', 'succeeded');

create table if not exists public.pro_strikes (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pros(id),
  job_id uuid not null references public.jobs(id),
  reason text not null check (reason in ('pro_cancel', 'pro_no_show')),
  created_at timestamptz not null default now()
);

alter table public.refunds enable row level security;
alter table public.pro_strikes enable row level security;
revoke all on public.refunds from public, anon, authenticated;
revoke all on public.pro_strikes from public, anon, authenticated;

-- Cancels a job. If a payment is held, records a full refund for the processor to send.
-- p_by is 'homeowner' or 'pro'. Only the matching party may call it.
create or replace function public.cancel_job_with_refund(p_job uuid, p_by text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  j record;
  p record;
  uid uuid := (select auth.uid());
  v_reason text;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;

  if p_by = 'homeowner' then
    if j.homeowner_id is distinct from uid then raise exception 'Solo el cliente puede cancelar.'; end if;
    v_reason := 'client_cancel_pre_work';
  elsif p_by = 'pro' then
    if j.pro_id is distinct from uid then raise exception 'Solo el profesional puede cancelar.'; end if;
    v_reason := 'pro_cancel';
  else
    raise exception 'Parte no válida.';
  end if;

  -- Before work starts only. Once work is in progress, a stop is a mediated case (later slice).
  if j.status not in ('requested', 'quoted', 'accepted') then
    raise exception 'El trabajo no se puede cancelar en este estado.';
  end if;

  if p_by = 'pro' then
    insert into public.pro_strikes (pro_id, job_id, reason) values (j.pro_id, j.id, 'pro_cancel');
  end if;

  select * into p from public.payments
   where job_id = j.id and purpose = 'job' and status = 'held'
   limit 1;

  update public.jobs set status = 'cancelled' where id = j.id;

  if p.id is null then
    return 'cancelled';
  end if;

  insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
  values (p.id, j.id, p.amount_dop, p.amount_minor, v_reason);
  return 'refund_pending';
end;
$$;

revoke execute on function public.cancel_job_with_refund(uuid, text) from public, anon;
grant execute on function public.cancel_job_with_refund(uuid, text) to authenticated, service_role;

-- Refunds waiting for the processor. Service role only.
create or replace function public.claim_pending_refunds(p_limit integer default 20)
returns table (refund_id uuid, payment_id uuid, payment_intent_id text, amount_minor bigint)
language sql
set search_path to ''
as $$
  select r.id, r.payment_id, p.stripe_payment_intent_id, r.amount_minor
    from public.refunds r
    join public.payments p on p.id = r.payment_id
   where r.status = 'pending'
   order by r.created_at
   limit greatest(1, least(p_limit, 50))
     for update of r skip locked;
$$;

-- Records a succeeded refund and moves the payment and job to refunded. Idempotent.
create or replace function public.mark_refund_succeeded(p_refund uuid, p_stripe_refund text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
begin
  update public.refunds
     set status = 'succeeded', stripe_refund_id = p_stripe_refund, processed_at = now()
   where id = p_refund and status = 'pending'
   returning * into r;
  if not found then return 'skipped'; end if;

  update public.payments
     set status = 'refunded', refunded_minor = r.amount_minor
   where id = r.payment_id;
  update public.jobs set payment_status = 'refunded' where id = r.job_id;
  return 'succeeded';
end;
$$;

revoke execute on function public.claim_pending_refunds(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_refunds(integer) to service_role;
revoke execute on function public.mark_refund_succeeded(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refund_succeeded(uuid, text) to service_role;
