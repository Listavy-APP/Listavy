-- 0036: boosted discovery honors the search filters, and the profile can ask whether a pro is boosted.
-- Applied to the project after 0035. The bodies below are the applied definitions.

drop function if exists public.boosted_pro_ids();

-- Boosted pros for a search. Same trade and zone filters as list_pro_cards, max 3, newest boost first.
create or replace function public.boosted_pro_ids(p_trade text default null, p_zone text default null)
returns table (pro_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.pro_id, b.starts_at
    from public.boosts b
    join public.pros p on p.id = b.pro_id
   where b.status = 'active'
     and b.ends_at > now()
     and p.verification_status = 'approved'
     and p.suspended_at is null
     and (p_trade is null or p.trade = p_trade)
     and (p_zone is null or p.zone = p_zone)
   order by b.starts_at desc
   limit 3;
$$;

revoke all on function public.boosted_pro_ids(text, text) from public;
grant execute on function public.boosted_pro_ids(text, text) to anon, authenticated;

-- Whether one pro has an active boost. Used for the "Destacado" label on the profile.
create or replace function public.is_pro_boosted(p_pro uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.boosts b
      join public.pros p on p.id = b.pro_id
     where b.pro_id = p_pro
       and b.status = 'active'
       and b.ends_at > now()
       and p.verification_status = 'approved'
       and p.suspended_at is null
  );
$$;

revoke all on function public.is_pro_boosted(uuid) from public;
grant execute on function public.is_pro_boosted(uuid) to anon, authenticated;
