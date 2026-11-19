-- 0093: Pro tools (queue item 7a). Three pro-side features. No client money path.
--
-- 1. pro_quote_templates: a pro's saved quote templates (title, amount, note). Owner-only RLS.
--    At most 20 templates per pro. Applying a template in the app only fills the quote form.
-- 2. pro_earnings_summary(): earnings cards and a 6-month series for the signed-in pro.
-- 3. pro_performance_summary(): quote and response metrics for the last 90 days.
-- 4. pro_statement_years() and pro_annual_statement(int): a records summary for one calendar year.
--
-- Access: every function reads only the caller's rows (auth.uid()) and refuses a caller who is not a pro.
-- Admin has no path to these tables or functions. Nothing here loosens an existing policy.
--
-- Definitions (all from existing rows; zone for dates is America/Santo_Domingo):
--  * Pro payment rows: payments joined to jobs where jobs.pro_id = caller and purpose in
--    ('job', 'diagnostic', 'revision'). Tips are part of the same row (tip_dop), so they are counted
--    once, inside net. purpose 'tip' is not used by the pro income figures.
--  * net:        coalesce(keep_pro_payout_dop, pro_payout_dop). After commission. Includes tip_dop.
--  * commission: coalesce(keep_commission_dop, commission_dop). Withheld by the platform.
--  * tip:        tip_dop. 100% to the pro, no commission.
--  * gross:      net + commission - tip. Reconciles: gross - commission + tip = net.
--                Gross is before any referral discount: the pro is paid on the amount before the discount.
--  * released:   status 'released'. Dated by released_at (fallback created_at).
--  * pending:    status in ('held', 'disputed'), net. Never part of a released total.
--  * performance (last 90 days, quotes.invited_at, revision_of is null):
--      submitted:  responded_at not null and status in ('sent', 'accepted', 'rejected', 'withdrawn').
--      accepted:   status 'accepted' with responded_at not null.
--      acceptance: accepted / submitted, as a whole percent. Null when submitted = 0.
--      response:   average of responded_at - invited_at, in hours, over responded quotes
--                  (status in 'sent', 'accepted', 'rejected', 'withdrawn', 'declined'). Expired invites are not responses.
--      rating:     pro_review_summary(caller): published reviews, all time. Not limited to 90 days.

-- ---------------------------------------------------------------------------
-- 1. Quote templates
-- ---------------------------------------------------------------------------
create table public.pro_quote_templates (
  id          uuid        primary key default gen_random_uuid(),
  pro_id      uuid        not null references public.pros (id) on delete cascade,
  title       text        not null check (char_length(btrim(title)) between 1 and 60),
  amount_dop  integer     not null check (amount_dop > 0),
  note        text        check (note is null or char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);

create index pro_quote_templates_pro_idx on public.pro_quote_templates (pro_id, created_at);

alter table public.pro_quote_templates enable row level security;

create policy pro_quote_templates_owner_select on public.pro_quote_templates for select
  using (pro_id = (select auth.uid()));
create policy pro_quote_templates_owner_insert on public.pro_quote_templates for insert
  with check (
    pro_id = (select auth.uid())
    and exists (select 1 from public.pros p where p.id = (select auth.uid()))
  );
create policy pro_quote_templates_owner_update on public.pro_quote_templates for update
  using (pro_id = (select auth.uid()))
  with check (pro_id = (select auth.uid()));
create policy pro_quote_templates_owner_delete on public.pro_quote_templates for delete
  using (pro_id = (select auth.uid()));

revoke all on public.pro_quote_templates from anon;

create or replace function public.pro_quote_templates_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.pro_quote_templates t where t.pro_id = new.pro_id) >= 20 then
    raise exception 'Solo puedes guardar 20 plantillas.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pro_quote_templates_limit
  before insert on public.pro_quote_templates
  for each row execute function public.pro_quote_templates_limit();

-- ---------------------------------------------------------------------------
-- 2. Earnings summary (caller only)
-- ---------------------------------------------------------------------------
create or replace function public.pro_earnings_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pro uuid := (select auth.uid());
  v_tz constant text := 'America/Santo_Domingo';
  v_this text := to_char(now() at time zone v_tz, 'YYYY-MM');
  v_last text := to_char((now() at time zone v_tz) - interval '1 month', 'YYYY-MM');
  v_result jsonb;
begin
  if not exists (select 1 from public.pros where id = v_pro) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  with pay as (
    select p.status,
           coalesce(p.released_at, p.created_at) as dated_at,
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop, 0) as net
      from public.payments p
      join public.jobs j on j.id = p.job_id
     where j.pro_id = v_pro
       and p.purpose in ('job', 'diagnostic', 'revision')
  ),
  released as (
    select to_char(dated_at at time zone v_tz, 'YYYY-MM') as m, net
      from pay
     where status = 'released'
  ),
  months as (
    select to_char((now() at time zone v_tz) - make_interval(months => g), 'YYYY-MM') as m
      from generate_series(0, 5) as g
  )
  select jsonb_build_object(
    'this_month', coalesce((select sum(net) from released where m = v_this), 0),
    'last_month', coalesce((select sum(net) from released where m = v_last), 0),
    'all_time',   coalesce((select sum(net) from released), 0),
    'pending',    coalesce((select sum(net) from pay where status in ('held', 'disputed')), 0),
    'monthly', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'month', x.m,
                 'amount', coalesce((select sum(r.net) from released r where r.m = x.m), 0)
               )
               order by x.m
             )
        from months x
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Performance summary, last 90 days (caller only)
-- ---------------------------------------------------------------------------
create or replace function public.pro_performance_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pro uuid := (select auth.uid());
  v_since timestamptz := now() - interval '90 days';
  v_submitted integer;
  v_accepted integer;
  v_hours numeric;
  v_rating_avg numeric;
  v_rating_count integer;
begin
  if not exists (select 1 from public.pros where id = v_pro) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select
    count(*) filter (where q.responded_at is not null and q.status in ('sent', 'accepted', 'rejected', 'withdrawn')),
    count(*) filter (where q.responded_at is not null and q.status = 'accepted'),
    round((avg(extract(epoch from (q.responded_at - q.invited_at))) filter (
             where q.responded_at is not null
               and q.status in ('sent', 'accepted', 'rejected', 'withdrawn', 'declined'))) / 3600.0, 1)
    into v_submitted, v_accepted, v_hours
    from public.quotes q
   where q.pro_id = v_pro
     and q.revision_of is null
     and q.invited_at >= v_since;

  select s.average, s.review_count into v_rating_avg, v_rating_count
    from public.pro_review_summary(v_pro) s;

  return jsonb_build_object(
    'days', 90,
    'submitted', v_submitted,
    'accepted', v_accepted,
    'acceptance_rate', case when v_submitted > 0 then round(v_accepted * 100.0 / v_submitted) else null end,
    'avg_response_hours', v_hours,
    'rating_average', v_rating_avg,
    'review_count', coalesce(v_rating_count, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Annual records summary (caller only). Not a fiscal document.
-- ---------------------------------------------------------------------------
create or replace function public.pro_statement_years()
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(y order by y desc), '{}'::integer[])
    from (
      select distinct extract(year from coalesce(p.released_at, p.created_at) at time zone 'America/Santo_Domingo')::integer as y
        from public.payments p
        join public.jobs j on j.id = p.job_id
       where j.pro_id = (select auth.uid())
         and p.purpose in ('job', 'diagnostic', 'revision')
         and p.status = 'released'
         and exists (select 1 from public.pros where id = (select auth.uid()))
    ) years;
$$;

create or replace function public.pro_annual_statement(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pro uuid := (select auth.uid());
  v_tz constant text := 'America/Santo_Domingo';
  v_lines jsonb;
  v_totals jsonb;
  v_pending numeric;
begin
  if not exists (select 1 from public.pros where id = v_pro) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Año no válido.' using errcode = '22023';
  end if;

  with released as (
    select p.id,
           to_char(coalesce(p.released_at, p.created_at) at time zone v_tz, 'YYYY-MM-DD') as released_on,
           j.trade,
           j.zone,
           coalesce(p.keep_pro_payout_dop, p.pro_payout_dop, 0) as net,
           coalesce(p.keep_commission_dop, p.commission_dop, 0) as commission,
           coalesce(p.tip_dop, 0) as tip
      from public.payments p
      join public.jobs j on j.id = p.job_id
     where j.pro_id = v_pro
       and p.purpose in ('job', 'diagnostic', 'revision')
       and p.status = 'released'
       and extract(year from coalesce(p.released_at, p.created_at) at time zone v_tz) = p_year
  ),
  lines as (
    select r.id, r.released_on, r.trade, r.zone,
           (r.net + r.commission - r.tip) as gross,
           r.commission, r.tip, r.net
      from released r
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'released_on', l.released_on,
      'trade', l.trade,
      'zone', l.zone,
      'gross', l.gross,
      'commission', l.commission,
      'tip', l.tip,
      'net', l.net
    ) order by l.released_on, l.id), '[]'::jsonb),
    jsonb_build_object(
      'gross', coalesce(sum(l.gross), 0),
      'commission', coalesce(sum(l.commission), 0),
      'tips', coalesce(sum(l.tip), 0),
      'net', coalesce(sum(l.net), 0)
    )
  into v_lines, v_totals
  from lines l;

  select coalesce(sum(coalesce(p.keep_pro_payout_dop, p.pro_payout_dop, 0)), 0)
    into v_pending
    from public.payments p
    join public.jobs j on j.id = p.job_id
   where j.pro_id = v_pro
     and p.purpose in ('job', 'diagnostic', 'revision')
     and p.status in ('held', 'disputed')
     and extract(year from p.created_at at time zone v_tz) = p_year;

  return jsonb_build_object(
    'year', p_year,
    'totals', v_totals,
    'pending', v_pending,
    'lines', v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: callers only. Anonymous users get nothing.
-- ---------------------------------------------------------------------------
revoke all on function public.pro_earnings_summary() from public, anon;
revoke all on function public.pro_performance_summary() from public, anon;
revoke all on function public.pro_statement_years() from public, anon;
revoke all on function public.pro_annual_statement(integer) from public, anon;
grant execute on function public.pro_earnings_summary() to authenticated;
grant execute on function public.pro_performance_summary() to authenticated;
grant execute on function public.pro_statement_years() to authenticated;
grant execute on function public.pro_annual_statement(integer) to authenticated;
