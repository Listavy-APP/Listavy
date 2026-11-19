-- 0089: admin revenue view. One read-only function returns GMV, retained commission,
-- the job funnel and a daily series for a 7, 30 or 90 day window.
--
-- Definitions (all from existing rows, no tracking tables):
--  * Paid payment: purpose in ('job','revision','diagnostic') and status in ('held','released','disputed').
--    Tips and pro-plan payments are excluded: tips are 100% to the pro, pro-plan fees are not job revenue.
--  * GMV: sum(payments.amount_dop) of paid payments created in the window.
--  * Commission: sum(coalesce(keep_commission_dop, commission_dop)) of the same payments. Refund
--    adjustments (keep_*) take precedence over the original commission.
--  * Funnel: cohort of jobs created in the window. requests = all jobs; quoted = jobs with at least
--    one quote; paid = jobs with a paid payment; completed = jobs with status 'completed'.
--  * Series buckets use America/Santo_Domingo, the same zone the admin pages use.
--
-- Admins only (is_admin(), TOTP session). Security definer so no existing RLS policy is loosened.

create or replace function public.admin_revenue_summary(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_tz constant text := 'America/Santo_Domingo';
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Periodo no válido.' using errcode = '22023';
  end if;

  v_since := now() - make_interval(days => p_days);

  with paid as (
    select
      p.job_id,
      p.created_at,
      coalesce(p.amount_dop, 0) as amount_dop,
      coalesce(p.keep_commission_dop, p.commission_dop, 0) as commission_dop
    from public.payments p
    where p.purpose in ('job', 'revision', 'diagnostic')
      and p.status in ('held', 'released', 'disputed')
      and p.created_at >= v_since
  ),
  cohort as (
    select j.id, j.status
    from public.jobs j
    where j.created_at >= v_since
  ),
  totals as (
    select
      coalesce(sum(amount_dop), 0) as gmv_dop,
      coalesce(sum(commission_dop), 0) as commission_dop,
      count(distinct job_id) as paid_payment_jobs
    from paid
  ),
  funnel as (
    select
      count(*) as requests,
      count(*) filter (where exists (
        select 1 from public.quotes q where q.job_id = c.id)) as quoted,
      count(*) filter (where exists (
        select 1 from public.payments p
        where p.job_id = c.id
          and p.purpose in ('job', 'revision', 'diagnostic')
          and p.status in ('held', 'released', 'disputed'))) as paid,
      count(*) filter (where c.status = 'completed') as completed
    from cohort c
  ),
  days as (
    select (d)::date as day
    from generate_series(
      ((now() at time zone v_tz)::date - (p_days - 1)),
      (now() at time zone v_tz)::date,
      interval '1 day'
    ) as d
  ),
  daily_paid as (
    select
      (created_at at time zone v_tz)::date as day,
      sum(amount_dop) as gmv_dop,
      sum(commission_dop) as commission_dop,
      count(distinct job_id) as paid_jobs
    from paid
    group by 1
  ),
  daily_requests as (
    select (created_at at time zone v_tz)::date as day, count(*) as requests
    from public.jobs
    where created_at >= v_since
    group by 1
  )
  select jsonb_build_object(
    'days', p_days,
    'gmv_dop', (select gmv_dop from totals),
    'commission_dop', (select commission_dop from totals),
    'funnel', (select jsonb_build_object(
        'requests', requests,
        'quoted', quoted,
        'paid', paid,
        'completed', completed) from funnel),
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day', to_char(dy.day, 'YYYY-MM-DD'),
          'gmv_dop', coalesce(dp.gmv_dop, 0),
          'commission_dop', coalesce(dp.commission_dop, 0),
          'paid_jobs', coalesce(dp.paid_jobs, 0),
          'requests', coalesce(dr.requests, 0))
        order by dy.day)
      from days dy
      left join daily_paid dp on dp.day = dy.day
      left join daily_requests dr on dr.day = dy.day
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_revenue_summary(integer) from public, anon;
grant execute on function public.admin_revenue_summary(integer) to authenticated, service_role;
