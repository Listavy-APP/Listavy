-- Listavy expansion, Phase 1: four new trades in Santo Domingo.
-- Additive only: widens the trade check on jobs and pros. No data is changed.
-- Numbered 0053 because 0052 is on feature/referral-promo (not yet merged).

alter table public.jobs drop constraint if exists jobs_trade_check;
alter table public.jobs add constraint jobs_trade_check
  check (trade in ('plumber', 'electrician', 'ac_technician', 'painter', 'locksmith', 'carpenter', 'blacksmith'));

alter table public.pros drop constraint if exists pros_trade_check;
alter table public.pros add constraint pros_trade_check
  check (trade in ('plumber', 'electrician', 'ac_technician', 'painter', 'locksmith', 'carpenter', 'blacksmith'));
