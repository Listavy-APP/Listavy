-- Admin payout view (Sprint 3). Read-only access for admins to the reserve ledger and pro recoveries.
-- Writes stay in the service-role functions from 0018 and 0019. Payments and disputes already allow admin reads (0001).

grant select on public.guarantee_reserve to authenticated;
grant select on public.pro_recoveries to authenticated;

drop policy if exists guarantee_reserve_admin_select on public.guarantee_reserve;
create policy guarantee_reserve_admin_select on public.guarantee_reserve
  for select using (public.is_admin());

drop policy if exists pro_recoveries_admin_select on public.pro_recoveries;
create policy pro_recoveries_admin_select on public.pro_recoveries
  for select using (public.is_admin());
