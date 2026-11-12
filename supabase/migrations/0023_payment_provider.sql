-- Payment provider (Sprint 3). One provider per job, stored on the job and on every payment.
-- Stripe is the only provider today. Phase 2 (Azul) adds its id to these two checks and nothing else in the schema.
-- Provider-specific column names (stripe_payment_intent_id, stripe_transfer_id) are unchanged in this slice.

alter table public.jobs
  add column if not exists payment_provider text not null default 'stripe';

alter table public.jobs drop constraint if exists jobs_payment_provider_known;
alter table public.jobs
  add constraint jobs_payment_provider_known check (payment_provider in ('stripe'));

alter table public.payments drop constraint if exists payments_provider_known;
alter table public.payments
  add constraint payments_provider_known check (provider in ('stripe'));

-- A job keeps one provider for its whole life. Changing it after a payment exists would split
-- one job's money across providers. Refused at the database.
create or replace function public.lock_job_provider_after_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.payment_provider is distinct from old.payment_provider
     and exists (select 1 from public.payments where job_id = old.id) then
    raise exception 'El proveedor de pago no puede cambiar después de un pago.';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_lock_provider_after_payment on public.jobs;
create trigger jobs_lock_provider_after_payment
  before update of payment_provider on public.jobs
  for each row execute function public.lock_job_provider_after_payment();
