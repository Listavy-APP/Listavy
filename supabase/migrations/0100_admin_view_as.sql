-- 0100 Admin view-as (read-only preview). NOT APPLIED: Sam applies via the Management API after review.
--
-- A super admin reads what one user sees in the app, for support.
-- Rules this file enforces:
--   1. Gate: public.is_super_admin() (0061): TOTP session (aal2) and admin_role = 'super_admin'.
--      Every refusal raises SQLSTATE 42501. A missing target raises P0002.
--   2. Read only. No function here writes user data. The one write is a single admin_audit_log
--      row when a super admin enters the mode (admin_view_as_enter). Reads never write.
--   3. No credential swap. Each function takes the target id and reads that user's rows the same
--      way that user's own RLS would allow. The admin's session is unchanged.
--   4. No existing write path gains a target-id parameter.

-- 1. Gate helper. Called only from the definers below (owner context). Not granted to any role.
create or replace function public.admin_view_as_require(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_target is null or not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'Usuario no encontrado.' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.admin_view_as_require(uuid) from public, anon, authenticated;

-- 2. Entry. The only write in this feature: one audit row per entry into the mode. ----------
create or replace function public.admin_view_as_enter(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  perform public.admin_log('view_as_start', p_target, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_view_as_enter(uuid) from public, anon;
grant execute on function public.admin_view_as_enter(uuid) to authenticated;

-- 3. Read definers. Each one is a SELECT. ---------------------------------------------------

-- Banner and header: name and role only. No phone, no email.
create or replace function public.admin_view_as_profile(p_target uuid)
returns table (user_id uuid, full_name text, user_role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select p.id, p.full_name, p.role
      from public.profiles p
     where p.id = p_target;
end;
$$;

-- Jobs list, as the user sees it: jobs they requested (client) and jobs they were hired for (pro).
-- Same 50-row limit and newest-first order as the user's own list.
create or replace function public.admin_view_as_jobs(p_target uuid)
returns table (
  job_id uuid,
  viewer_role text,
  trade text,
  zone text,
  job_status text,
  payment_status text,
  created_at timestamptz,
  amount_dop integer,
  pro_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select x.job_id, x.viewer_role, x.trade, x.zone, x.job_status, x.payment_status, x.created_at, x.amount_dop, x.pro_name
      from (
        select j.id as job_id, 'homeowner'::text as viewer_role, j.trade, j.zone,
               j.status as job_status, j.payment_status, j.created_at,
               q.amount_dop, pp.full_name as pro_name
          from public.jobs j
          left join public.quotes q on q.id = j.approved_quote_id
          left join public.profiles pp on pp.id = j.pro_id
         where j.homeowner_id = p_target
        union all
        select j.id, 'pro'::text, j.trade, j.zone,
               j.status, j.payment_status, j.created_at,
               q.amount_dop, null::text
          from public.jobs j
          left join public.quotes q on q.id = j.approved_quote_id
         where j.pro_id = p_target
      ) x
     order by x.created_at desc
     limit 50;
end;
$$;

-- One job, only if the target is its homeowner or its pro. Otherwise no rows.
create or replace function public.admin_view_as_job(p_target uuid, p_job uuid)
returns table (
  job_id uuid,
  viewer_role text,
  trade text,
  zone text,
  job_status text,
  payment_status text,
  created_at timestamptz,
  amount_dop integer,
  pro_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select j.id,
           case when j.homeowner_id = p_target then 'homeowner' else 'pro' end::text,
           j.trade, j.zone, j.status, j.payment_status, j.created_at,
           q.amount_dop,
           case when j.homeowner_id = p_target then pp.full_name else null::text end
      from public.jobs j
      left join public.quotes q on q.id = j.approved_quote_id
      left join public.profiles pp on pp.id = j.pro_id
     where j.id = p_job
       and (j.homeowner_id = p_target or j.pro_id = p_target);
end;
$$;

-- Quotes on one job, as the target may read them. Mirrors quotes_select (0001):
-- a pro sees only their own quote; the job's homeowner sees all quotes.
create or replace function public.admin_view_as_quotes(p_target uuid, p_job uuid)
returns table (quote_id uuid, pro_name text, amount_dop integer, quote_status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select q.id, pp.full_name, q.amount_dop, q.status, q.created_at
      from public.quotes q
      join public.jobs j on j.id = q.job_id
      left join public.profiles pp on pp.id = q.pro_id
     where q.job_id = p_job
       and (j.homeowner_id = p_target or q.pro_id = p_target)
     order by q.created_at;
end;
$$;

-- Notification inbox, grouped the way the user's own inbox groups it (0098), for one user.
create or replace function public.admin_view_as_notifications(p_target uuid, p_limit integer default 50)
returns table (
  group_id uuid,
  notice_kind text,
  notice_link text,
  last_at timestamptz,
  delivered boolean,
  unread boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
  with src as (
    select n.id, n.kind, n.channel, n.status, n.created_at, n.read_at, n.link,
           coalesce((regexp_match(coalesce(n.link, ''), '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))[1], '') as subj
      from public.notification_log n
     where n.user_id = p_target
       and n.status <> 'skipped_preference'
     order by n.created_at desc
     limit 500
  ),
  flagged as (
    select s.*,
      case when lag(s.created_at) over w is null or s.created_at - lag(s.created_at) over w > interval '5 minutes'
           then 1 else 0 end as is_new
    from src s
    window w as (partition by s.kind, s.subj order by s.created_at)
  ),
  grouped as (
    select f.*, sum(f.is_new) over (partition by f.kind, f.subj order by f.created_at) as gnum
    from flagged f
  )
  select
    (array_agg(g.id order by g.created_at))[1],
    g.kind,
    (array_agg(g.link order by g.created_at desc) filter (where g.link is not null))[1],
    max(g.created_at),
    bool_or(g.status = 'sent'),
    bool_or(g.read_at is null)
  from grouped g
  group by g.kind, g.subj, g.gnum
  order by max(g.created_at) desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- Payout details of a pro, masked exactly as the pro's own screen shows them (maskAccount).
create or replace function public.admin_view_as_payout(p_target uuid)
returns table (bank_code text, branch_code text, account_masked text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select d.bank_code, d.branch_code, '•••• ' || right(d.account_number, 4)
      from public.pro_payout_details d
     where d.pro_id = p_target;
end;
$$;

-- 4. Grants. Read definers: authenticated only. Each one re-checks the gate itself. -----------
revoke execute on function public.admin_view_as_profile(uuid) from public, anon;
revoke execute on function public.admin_view_as_jobs(uuid) from public, anon;
revoke execute on function public.admin_view_as_job(uuid, uuid) from public, anon;
revoke execute on function public.admin_view_as_quotes(uuid, uuid) from public, anon;
revoke execute on function public.admin_view_as_notifications(uuid, integer) from public, anon;
revoke execute on function public.admin_view_as_payout(uuid) from public, anon;
grant execute on function public.admin_view_as_profile(uuid) to authenticated;
grant execute on function public.admin_view_as_jobs(uuid) to authenticated;
grant execute on function public.admin_view_as_job(uuid, uuid) to authenticated;
grant execute on function public.admin_view_as_quotes(uuid, uuid) to authenticated;
grant execute on function public.admin_view_as_notifications(uuid, integer) to authenticated;
grant execute on function public.admin_view_as_payout(uuid) to authenticated;
