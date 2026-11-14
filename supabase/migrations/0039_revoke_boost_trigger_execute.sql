-- 0039: the boost pause trigger function is not callable over the API. Triggers still fire without EXECUTE.
-- Applied to the project after 0038.
revoke all on function public.sync_boosts_with_pro_status() from public, anon, authenticated;
