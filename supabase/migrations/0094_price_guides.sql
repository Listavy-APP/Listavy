-- 0094: public price guides. Aggregates only, one row per trade.
-- NOT APPLIED. Sam reviews, then Fabian approves.
--
-- Why: /precios and the /pedir helper show a typical price range per trade. The page is public,
-- so the function returns counts and medians only. It never returns pro rows, names or ids.
--
-- Rules:
--   * Included pros: verification_status = 'approved', closed_at is null, is_demo = false,
--     and a stated range (price_max_dop > 0). A range of 0 to 0 means no range was entered.
--   * Typical low = median of price_min_dop over included pros, rounded to whole pesos.
--   * Typical high = median of price_max_dop over included pros, rounded to whole pesos.
--   * A trade gets low and high only when sample >= 3. Below 3, low and high are null.
--   * Every trade in the list is returned, so the page can show an honest empty state.
--   * All cities together for v1. City splits wait for enough data per city.
--
-- Access: SECURITY DEFINER reads pros. anon and authenticated get execute only; no table grants change.

create or replace function public.get_price_guides()
returns table (
  trade text,
  sample integer,
  low_dop integer,
  high_dop integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with trades(trade) as (
    values ('plumber'), ('electrician'), ('ac_technician'), ('painter'),
           ('locksmith'), ('carpenter'), ('blacksmith')
  ),
  stated as (
    select p.trade, p.price_min_dop, p.price_max_dop
    from public.pros p
    where p.verification_status = 'approved'
      and p.closed_at is null
      and p.is_demo = false
      and p.price_max_dop > 0
  ),
  agg as (
    select s.trade,
           count(*)::integer as sample,
           round(percentile_cont(0.5) within group (order by s.price_min_dop))::integer as low_dop,
           round(percentile_cont(0.5) within group (order by s.price_max_dop))::integer as high_dop
    from stated s
    group by s.trade
  )
  select t.trade,
         coalesce(a.sample, 0) as sample,
         case when coalesce(a.sample, 0) >= 3 then a.low_dop end as low_dop,
         case when coalesce(a.sample, 0) >= 3 then a.high_dop end as high_dop
  from trades t
  left join agg a on a.trade = t.trade
  order by t.trade;
$$;

revoke all on function public.get_price_guides() from public;
grant execute on function public.get_price_guides() to anon, authenticated;
