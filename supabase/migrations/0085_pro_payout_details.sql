-- 0085: payout bank details collected from pros. Collection and storage only.
-- No payout, recipient or Stripe logic. The later payout build reads this table.
-- NOT APPLIED. Sam reviews, then Fabian approves before this runs in production.
--
-- Own table, not columns on public.pros: pros_select_public lets any role read approved pro
-- rows, so bank columns on pros would be public. This table has owner-only RLS and no
-- anon grant. Nothing public selects from it.

create table public.pro_payout_details (
  pro_id         uuid primary key references public.pros (id) on delete cascade,
  bank_code      text not null check (bank_code ~ '^[0-9]{1,3}$'),
  branch_code    text check (branch_code is null or branch_code ~ '^[0-9]{1,5}$'),   -- null = none given
  account_number text not null check (account_number ~ '^[0-9]{1,28}$'),
  updated_at     timestamptz not null default now()
);

alter table public.pro_payout_details enable row level security;

revoke all on public.pro_payout_details from public, anon, authenticated;
grant select, insert, update on public.pro_payout_details to authenticated;

-- Owner only. A pro reads, adds and changes their own row. No delete, no admin read in this build.
create policy pro_payout_details_select_own on public.pro_payout_details
  for select to authenticated
  using (pro_id = (select auth.uid()));

create policy pro_payout_details_insert_own on public.pro_payout_details
  for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role = 'pro')
  );

create policy pro_payout_details_update_own on public.pro_payout_details
  for update to authenticated
  using (pro_id = (select auth.uid()))
  with check (pro_id = (select auth.uid()));
