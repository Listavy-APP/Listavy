-- 0104: public profile fetch for pros outside the default city.
-- list_pro_cards applied p.city = p_city even for a by-id fetch, and p_city defaults to santo_domingo,
-- so every approved pro outside Santo Domingo returned no card on /pro/[id].
-- Fix: a by-id fetch skips the city filter, the same way the demo rule special-cases p_pro_id.
-- Only the city predicate changes. Signature, return columns, other filters, ordering, limit and grants are as in 0082.
-- Search by city (p_pro_id null) still filters by city.

create or replace function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo',
                                      p_pro_type text default null)
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean, is_demo boolean,
              pro_type text, razon_social text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, pr.full_name, p.trade, p.zone, p.price_min_dop, p.price_max_dop, p.plan, p.verified_at,
         (select f.storage_path from public.pro_files f
           where f.pro_id = p.id and f.kind = 'avatar' and f.review_status = 'approved'
           order by f.created_at desc limit 1) as avatar_path,
         p.bio,
         (p.verified_at is not null) as identity_verified,
         (pr.email_verified_at is not null) as email_verified,
         (pr.phone is not null) as phone_verified,
         p.available,
         p.is_demo,
         p.pro_type,
         case when p.pro_type = 'company'
              then (select c.razon_social from public.pro_companies c where c.pro_id = p.id)
         end as razon_social
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.closed_at is null
    and (p_pro_id is not null or p.city = p_city)
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
    and (p_pro_type is null or p_pro_type = 'any' or p.pro_type = p_pro_type)
    and (not p.is_demo or p_pro_id is not null)
  order by p.verified_at desc nulls last
  limit 50;
$$;
