-- 0031 follow-ups to 0030 and 0018.

-- 1. The dispute-close trigger function is not an RPC. Triggers still fire after revoke:
--    EXECUTE is checked when the trigger is created, not when it fires.
revoke all on function public.sync_reviews_on_dispute_close() from public, anon, authenticated;

-- 2. Refunds: 0018 revoked all access from authenticated. Admins need read-only access to
--    refund rows (audit and the dispute desk). Pros and homeowners still see nothing.
--    Writes stay in security definer functions and the service role.
grant select on public.refunds to authenticated;
drop policy if exists refunds_admin_select on public.refunds;
create policy refunds_admin_select on public.refunds
  for select using (public.is_admin());
