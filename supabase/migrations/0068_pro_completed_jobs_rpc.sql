-- 0068: public count of a pro's completed jobs. jobs_select hides other people's jobs,
-- so the public profile needs this narrow aggregate. Returns a number only.
create or replace function public.pro_completed_jobs(p_pro uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.jobs j where j.pro_id = p_pro and j.status = 'completed';
$$;

revoke execute on function public.pro_completed_jobs(uuid) from public, anon, authenticated;
grant execute on function public.pro_completed_jobs(uuid) to anon, authenticated, service_role;
