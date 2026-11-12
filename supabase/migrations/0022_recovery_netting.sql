-- Recovery netting (Sprint 3). When a held payment is claimed for release, the pro's owed recoveries
-- are deducted from the payout, oldest first, until the debt is covered or the payout is used up.
-- Netting runs once per payment, inside the claim. A retry after a failed transfer reuses the stored
-- amount, so a retry cannot deduct twice.

-- 1. Progress on each recovery. status flips to 'settled' when settled_dop reaches amount_dop.
alter table public.pro_recoveries
  add column if not exists settled_dop integer not null default 0;

alter table public.pro_recoveries
  drop constraint if exists pro_recoveries_settled_within_amount;
alter table public.pro_recoveries
  add constraint pro_recoveries_settled_within_amount
  check (settled_dop >= 0 and settled_dop <= amount_dop);

-- 2. Netting marker on each payment. netted_at is set once, when the claim nets the payment.
alter table public.payments
  add column if not exists netted_at timestamptz,
  add column if not exists recovery_netted_dop integer not null default 0 check (recovery_netted_dop >= 0);

-- 3. Deduction ledger. One row per debt touched by a payment. Admins read it. Service role writes it.
-- A reversal sets reversed_at and keeps the row for the audit trail. A reversed row no longer counts.
create table if not exists public.recovery_deductions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  recovery_id uuid not null references public.pro_recoveries (id),
  amount_dop integer not null check (amount_dop > 0),
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);

create unique index if not exists recovery_deductions_one_active
  on public.recovery_deductions (payment_id, recovery_id)
  where reversed_at is null;

alter table public.recovery_deductions enable row level security;
revoke all on public.recovery_deductions from public, anon, authenticated;
grant select on public.recovery_deductions to authenticated;

drop policy if exists recovery_deductions_admin_select on public.recovery_deductions;
create policy recovery_deductions_admin_select on public.recovery_deductions
  for select using (public.is_admin());

-- 4a. Reverse a payment's active deductions. The debt goes back to owed. Runs when the payout basis
-- changes: a full refund before release, or a partial pre-release split. Returns the total reversed.
create or replace function public.reverse_recovery_netting(p_payment uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  d record;
  v_total integer := 0;
begin
  for d in
    select id, recovery_id, amount_dop
      from public.recovery_deductions
     where payment_id = p_payment and reversed_at is null
       for update
  loop
    update public.pro_recoveries
       set settled_dop = settled_dop - d.amount_dop, status = 'owed'
     where id = d.recovery_id;
    update public.recovery_deductions set reversed_at = now() where id = d.id;
    v_total := v_total + d.amount_dop;
  end loop;

  update public.payments
     set netted_at = null, recovery_netted_dop = 0
   where id = p_payment and netted_at is not null;
  return v_total;
end;
$$;

revoke execute on function public.reverse_recovery_netting(uuid) from public, anon, authenticated;
grant execute on function public.reverse_recovery_netting(uuid) to service_role;

create or replace function public.reverse_netting_on_payout_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (new.status = 'refunded' and old.status is distinct from new.status)
     or (new.keep_dop is distinct from old.keep_dop) then
    perform public.reverse_recovery_netting(new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.reverse_netting_on_payout_change() from public, anon, authenticated;

drop trigger if exists payments_reverse_netting on public.payments;
create trigger payments_reverse_netting
  after update of status, keep_dop on public.payments
  for each row execute function public.reverse_netting_on_payout_change();

-- 4. Netting for one payment. Returns the total deducted in RD$. Locks the pro's debts while it works.
create or replace function public.net_pro_recoveries(p_payment uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pay record;
  v_remaining integer;
  v_take integer;
  v_total integer := 0;
  r record;
begin
  select p.netted_at, p.recovery_netted_dop,
         coalesce(p.keep_pro_payout_dop, p.pro_payout_dop) as gross,
         j.pro_id
    into v_pay
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where p.id = p_payment
     for update of p;
  if not found then raise exception 'Pago no encontrado.'; end if;
  if v_pay.netted_at is not null then return v_pay.recovery_netted_dop; end if;

  v_remaining := v_pay.gross;
  for r in
    select id, amount_dop, settled_dop
      from public.pro_recoveries
     where pro_id = v_pay.pro_id and status = 'owed'
     order by created_at, id
       for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, r.amount_dop - r.settled_dop);
    continue when v_take <= 0;

    insert into public.recovery_deductions (payment_id, recovery_id, amount_dop)
    values (p_payment, r.id, v_take);
    update public.pro_recoveries
       set settled_dop = settled_dop + v_take,
           status = case when settled_dop + v_take >= amount_dop then 'settled' else 'owed' end
     where id = r.id;

    v_remaining := v_remaining - v_take;
    v_total := v_total + v_take;
  end loop;

  update public.payments
     set netted_at = now(), recovery_netted_dop = v_total
   where id = p_payment;
  return v_total;
end;
$$;

revoke execute on function public.net_pro_recoveries(uuid) from public, anon, authenticated;
grant execute on function public.net_pro_recoveries(uuid) to service_role;

-- 5. Claim with netting. Same selection as 0019. Adds net_payout_dop (what the pro receives) and
-- recovery_dop (what was deducted). pro_payout_dop stays the gross share.
drop function if exists public.claim_due_payments(integer);

create or replace function public.claim_due_payments(p_limit integer default 20)
returns table (
  payment_id uuid,
  job_id uuid,
  payment_intent_id text,
  amount_minor bigint,
  amount_dop integer,
  pro_payout_dop integer,
  net_payout_dop integer,
  recovery_dop integer,
  pro_account_id text
)
language plpgsql
set search_path to ''
as $$
declare
  c record;
  v_recovery integer;
begin
  for c in
    select p.id as pid, p.job_id as jid, p.stripe_payment_intent_id as pi,
           coalesce(p.keep_minor, p.amount_minor) as amt_minor,
           coalesce(p.keep_dop, p.amount_dop) as amt_dop,
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop) as gross,
           pr.stripe_account_id as acct
      from public.payments p
      join public.jobs j on j.id = p.job_id
      join public.pros pr on pr.id = j.pro_id
     where p.status = 'held'
       and p.release_after <= now()
       and j.status = 'completed'
     order by p.release_after
     limit greatest(1, least(p_limit, 50))
       for update of p skip locked
  loop
    v_recovery := public.net_pro_recoveries(c.pid);
    payment_id := c.pid;
    job_id := c.jid;
    payment_intent_id := c.pi;
    amount_minor := c.amt_minor;
    amount_dop := c.amt_dop;
    pro_payout_dop := c.gross;
    recovery_dop := v_recovery;
    net_payout_dop := c.gross - v_recovery;
    pro_account_id := c.acct;
    return next;
  end loop;
end;
$$;

revoke execute on function public.claim_due_payments(integer) from public, anon, authenticated;
grant execute on function public.claim_due_payments(integer) to service_role;
