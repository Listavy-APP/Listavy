-- Release flow (Sprint 3). Pro payouts go to the pro's Connect account 24 h after approval.
-- Scheduling (pg_cron + pg_net) is set up in production outside this file. See the
-- release-payments function. Extensions are not created here, so tests can run in PGlite.

alter table public.pros add column if not exists stripe_account_id text unique;

-- Only the server sets a payout account. A signed-in pro or anon cannot write it,
-- even though the pros UPDATE policy allows edits to their own row.
create or replace function public.pros_guard_stripe_account()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if (tg_op = 'INSERT' and new.stripe_account_id is not null)
     or (tg_op = 'UPDATE' and new.stripe_account_id is distinct from old.stripe_account_id) then
    -- PostgREST switches to the authenticated or anon role for client requests.
    if current_user in ('authenticated', 'anon') then
      raise exception 'La cuenta de pagos solo la asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pros_guard_stripe_account on public.pros;
create trigger pros_guard_stripe_account
  before insert or update on public.pros
  for each row execute function public.pros_guard_stripe_account();

-- Approval starts the 24 h clock for every payment still held on the job.
create or replace function public.jobs_set_release_after()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'completed' and new.approved_at is not null and old.status is distinct from 'completed' then
    update public.payments
       set release_after = new.approved_at + interval '24 hours'
     where job_id = new.id and status = 'held' and release_after is null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_set_release_after on public.jobs;
create trigger jobs_set_release_after
  after update of status on public.jobs
  for each row execute function public.jobs_set_release_after();

-- Payments due for transfer. Service role only. Locks rows for the duration of the call.
create or replace function public.claim_due_payments(p_limit integer default 20)
returns table (
  payment_id uuid,
  job_id uuid,
  payment_intent_id text,
  amount_minor bigint,
  amount_dop integer,
  pro_payout_dop integer,
  pro_account_id text
)
language sql
set search_path to ''
as $$
  select p.id, p.job_id, p.stripe_payment_intent_id, p.amount_minor, p.amount_dop, p.pro_payout_dop, pr.stripe_account_id
    from public.payments p
    join public.jobs j on j.id = p.job_id
    join public.pros pr on pr.id = j.pro_id
   where p.status = 'held'
     and p.release_after <= now()
     and j.status = 'completed'
   order by p.release_after
   limit greatest(1, least(p_limit, 50))
     for update of p skip locked;
$$;

-- Records a completed transfer. A second call for the same payment is a no-op.
create or replace function public.mark_payment_released(p_payment uuid, p_transfer text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.payments
     set status = 'released', released_at = now(), stripe_transfer_id = p_transfer
   where id = p_payment and status = 'held';
  if not found then return 'skipped'; end if;
  return 'released';
end;
$$;

revoke execute on function public.claim_due_payments(integer) from public, anon, authenticated;
grant execute on function public.claim_due_payments(integer) to service_role;
revoke execute on function public.mark_payment_released(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_released(uuid, text) to service_role;
