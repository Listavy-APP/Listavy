-- 0069: admin notification badge. One call returns unresolved counts by category,
-- the total, and a severity. Counts come from live rows, so resolving an item in its
-- section clears it from the badge. Admins only (is_admin(), TOTP session).
create or replace function public.admin_notification_summary()
returns table (
  open_disputes bigint,
  open_pro_reports bigint,
  reviews_awaiting_moderation bigint,
  unresolved_job_flags bigint,
  pending_pro_applications bigint,
  total bigint,
  severity text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_disputes bigint;
  v_reports bigint;
  v_reviews bigint;
  v_flags bigint;
  v_pros bigint;
  v_total bigint;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;

  select count(*) into v_disputes from public.disputes where status = 'open';
  select count(*) into v_reports from public.pro_reports where resolved_at is null;
  select count(*) into v_reviews from public.reviews where status = 'hidden';
  select count(*) into v_flags from public.job_notifications
    where problem_reported_at is not null and problem_resolved_at is null;
  select count(*) into v_pros from public.pros where verification_status = 'pending';

  v_total := v_disputes + v_reports + v_reviews + v_flags + v_pros;

  return query select
    v_disputes, v_reports, v_reviews, v_flags, v_pros, v_total,
    case when v_disputes > 0 or v_reports > 0 then 'urgent'
         when v_total > 0 then 'attention'
         else 'clear' end;
end;
$$;

revoke execute on function public.admin_notification_summary() from public, anon;
grant execute on function public.admin_notification_summary() to authenticated, service_role;
