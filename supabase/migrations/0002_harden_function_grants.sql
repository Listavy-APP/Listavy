-- Listavy · 0002 · Tighten EXECUTE grants on SECURITY DEFINER functions.
-- Postgres grants EXECUTE to PUBLIC by default. Supabase exposes public functions
-- as RPC endpoints, so anon and authenticated clients could call them directly.

-- Trigger functions: only the database engine should run them. No client EXECUTE.
revoke execute on function public.handle_new_user()           from public, anon, authenticated;
revoke execute on function public.guard_profile_privileges()  from public, anon, authenticated;
revoke execute on function public.guard_pro_privileges()      from public, anon, authenticated;

-- RLS helpers: policies call them as the signed-in user, so authenticated needs EXECUTE.
-- anon never needs them.
revoke execute on function public.is_admin()                  from public, anon;
revoke execute on function public.is_job_homeowner(uuid)      from public, anon;
revoke execute on function public.is_job_party(uuid)          from public, anon;
revoke execute on function public.has_quoted_job(uuid)        from public, anon;

grant execute on function public.is_admin()                   to authenticated;
grant execute on function public.is_job_homeowner(uuid)       to authenticated;
grant execute on function public.is_job_party(uuid)           to authenticated;
grant execute on function public.has_quoted_job(uuid)         to authenticated;
