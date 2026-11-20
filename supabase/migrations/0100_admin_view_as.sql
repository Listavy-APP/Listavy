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

-- 2. Entry. The only write in this feature. One audit row per admin, target and session.
--    Called by the preview layout on every render, so a direct URL is logged too. Repeat calls in the
--    same session add nothing. The advisory lock stops two parallel first loads from both logging.
--    Session key: the session_id claim of the access token. Without it, all sessions share one key
--    (the 'no-session' fallback). Sam verifies the claim is present on production tokens.
create or replace function public.admin_view_as_enter(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_session text := coalesce((select auth.jwt()) ->> 'session_id', 'no-session');
begin
  perform public.admin_view_as_require(p_target);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_target::text || ':' || v_session, 0));
  if not exists (
    select 1 from public.admin_audit_log l
     where l.actor_id = v_actor
       and l.action = 'view_as_start'
       and l.target_id = p_target
       and l.details ->> 'session_id' = v_session
  ) then
    perform public.admin_log('view_as_start', p_target, jsonb_build_object('session_id', v_session));
  end if;
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
returns table (quote_id uuid, pro_name text, amount_dop integer, quote_status text, created_at timestamptz, is_revision boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select q.id, pp.full_name, q.amount_dop, q.status, q.created_at, (q.revision_of is not null)
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


-- Photos the target may see: the job's homeowner, its pro, or a pro who quoted (can_view_job_photo, 0011).
-- The page signs URLs only for paths returned here.
create or replace function public.admin_view_as_job_photos(p_target uuid, p_job uuid)
returns table (photo_id uuid, photo_kind text, storage_path text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select jp.id, jp.kind, jp.storage_path, jp.created_at
      from public.job_photos jp
      join public.jobs j on j.id = jp.job_id
     where jp.job_id = p_job
       and (j.homeowner_id = p_target or j.pro_id = p_target
            or exists (select 1 from public.quotes q where q.job_id = p_job and q.pro_id = p_target))
     order by jp.created_at;
end;
$$;

-- Payment summary: amount, currency and status only. No provider ids, no card data.
create or replace function public.admin_view_as_job_payments(p_target uuid, p_job uuid)
returns table (amount_minor bigint, currency text, payment_status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select py.amount_minor, py.currency, py.status, py.created_at
      from public.payments py
      join public.jobs j on j.id = py.job_id
     where py.job_id = p_job
       and (j.homeowner_id = p_target or j.pro_id = p_target)
     order by py.created_at;
end;
$$;

-- Dispute status for the job's parties. Statuses, dates and the decision. No evidence statements.
create or replace function public.admin_view_as_job_disputes(p_target uuid, p_job uuid)
returns table (
  dispute_id uuid,
  opened_by_target boolean,
  stage text,
  dispute_status text,
  outcome text,
  refund_dop integer,
  opened_at timestamptz,
  decided_at timestamptz,
  decision_reason text,
  payment_amount_minor bigint,
  payment_currency text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_view_as_require(p_target);
  return query
    select d.id,
           (d.opened_side = case when j.homeowner_id = p_target then 'homeowner' else 'pro' end),
           d.stage, d.status, d.outcome, d.refund_dop, d.opened_at, d.decided_at, d.decision_reason,
           py.amount_minor, py.currency
      from public.disputes d
      join public.jobs j on j.id = d.job_id
      left join public.payments py on py.id = d.payment_id
     where d.job_id = p_job
       and (j.homeowner_id = p_target or j.pro_id = p_target)
     order by d.opened_at desc;
end;
$$;

-- 4. Grants. Read definers: authenticated only. Each one re-checks the gate itself. -----------
revoke execute on function public.admin_view_as_profile(uuid) from public, anon;
revoke execute on function public.admin_view_as_jobs(uuid) from public, anon;
revoke execute on function public.admin_view_as_job(uuid, uuid) from public, anon;
revoke execute on function public.admin_view_as_quotes(uuid, uuid) from public, anon;
revoke execute on function public.admin_view_as_notifications(uuid, integer) from public, anon;
revoke execute on function public.admin_view_as_payout(uuid) from public, anon;
revoke execute on function public.admin_view_as_job_photos(uuid, uuid) from public, anon;
revoke execute on function public.admin_view_as_job_payments(uuid, uuid) from public, anon;
revoke execute on function public.admin_view_as_job_disputes(uuid, uuid) from public, anon;
grant execute on function public.admin_view_as_profile(uuid) to authenticated;
grant execute on function public.admin_view_as_jobs(uuid) to authenticated;
grant execute on function public.admin_view_as_job(uuid, uuid) to authenticated;
grant execute on function public.admin_view_as_quotes(uuid, uuid) to authenticated;
grant execute on function public.admin_view_as_notifications(uuid, integer) to authenticated;
grant execute on function public.admin_view_as_payout(uuid) to authenticated;
grant execute on function public.admin_view_as_job_photos(uuid, uuid) to authenticated;
grant execute on function public.admin_view_as_job_payments(uuid, uuid) to authenticated;
grant execute on function public.admin_view_as_job_disputes(uuid, uuid) to authenticated;
