-- Listavy · 0004 · Replace the pro_cards view with a function.
-- A security-definer view is flagged as an error by the Supabase advisor.
-- A function with explicit parameters and an explicit EXECUTE grant does the same job
-- without that flag. It returns approved pros only and only safe columns.

drop view if exists public.pro_cards;

create or replace function public.list_pro_cards(p_trade text default null, p_zone text default null)
returns table (
  id uuid,
  full_name text,
  trade text,
  zone text,
  price_min_dop integer,
  price_max_dop integer,
  plan text,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, pr.full_name, p.trade, p.zone, p.price_min_dop, p.price_max_dop, p.plan, p.verified_at
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke execute on function public.list_pro_cards(text, text) from public, anon;
grant execute on function public.list_pro_cards(text, text) to authenticated;
