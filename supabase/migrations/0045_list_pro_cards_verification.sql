-- Adds bio and verification booleans to list_pro_cards. Return type changed, so drop and recreate.
-- Grants follow migration 0008: authenticated and anon, not public.
drop function public.list_pro_cards(text, text, uuid);

create function public.list_pro_cards(
  p_trade text default null,
  p_zone text default null,
  p_pro_id uuid default null
)
returns table(
  id uuid, full_name text, trade text, zone text,
  price_min_dop integer, price_max_dop integer, plan text,
  verified_at timestamptz, avatar_path text,
  bio text, identity_verified boolean, email_verified boolean, phone_verified boolean
)
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
         (pr.phone is not null) as phone_verified
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
  order by p.verified_at desc nulls last
  limit 50;
$$;

revoke execute on function public.list_pro_cards(text, text, uuid) from public, anon;
grant execute on function public.list_pro_cards(text, text, uuid) to authenticated, anon;
