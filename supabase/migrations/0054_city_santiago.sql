-- Listavy Phase 2: Santiago de los Caballeros.
-- Additive: new city column (default santo_domingo), city-aware zone rules, city filter on search.
-- No existing rows change: every current job and pro is in a Santo Domingo zone.

-- 1. City on jobs and pros.
alter table public.jobs add column if not exists city text not null default 'santo_domingo'
  constraint jobs_city_valid check (city in ('santo_domingo', 'santiago'));
alter table public.pros add column if not exists city text not null default 'santo_domingo'
  constraint pros_city_valid check (city in ('santo_domingo', 'santiago'));

-- 2. Zone to city. Zone names do not overlap between the two cities.
create or replace function public.city_of_zone(p_zone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_zone in ('Centro', 'Pueblo Nuevo', 'Los Pepines', 'Gurabito', 'Villa Olga', 'La Trinitaria',
                    'Cerros de Gurabo', 'Gurabo', 'Llanos de Gurabo', 'La Esmeralda',
                    'Jardines Metropolitanos', 'Thomen', 'Villa María', 'La Salle', 'Ensanche Libertad')
      then 'santiago'
    when p_zone in ('Piantini', 'Naco', 'Bella Vista', 'Gazcue', 'Serrallés', 'Ciudad Colonial',
                    'Los Cacicazgos', 'Evaristo Morales', 'Mirador Norte', 'Mirador Sur',
                    'Villa Juana', 'Los Prados', 'Arroyo Hondo', 'Ensanche Ozama', 'Los Mina')
      then 'santo_domingo'
    else null
  end;
$$;

-- 3. Keep city in step with zone on every insert and zone change.
create or replace function public.set_city_from_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.city := coalesce(public.city_of_zone(new.zone), 'santo_domingo');
  return new;
end;
$$;

drop trigger if exists jobs_set_city on public.jobs;
create trigger jobs_set_city before insert or update of zone on public.jobs
  for each row execute function public.set_city_from_zone();

drop trigger if exists pros_set_city on public.pros;
create trigger pros_set_city before insert or update of zone on public.pros
  for each row execute function public.set_city_from_zone();

-- 4. Zone must belong to the city. Replaces the Santo Domingo-only pros_zone_valid.
alter table public.pros drop constraint if exists pros_zone_valid;
alter table public.pros add constraint pros_zone_by_city check (
  (city = 'santo_domingo' and zone in ('Piantini', 'Naco', 'Bella Vista', 'Gazcue', 'Serrallés', 'Ciudad Colonial',
     'Los Cacicazgos', 'Evaristo Morales', 'Mirador Norte', 'Mirador Sur', 'Villa Juana', 'Los Prados',
     'Arroyo Hondo', 'Ensanche Ozama', 'Los Mina'))
  or
  (city = 'santiago' and zone in ('Centro', 'Pueblo Nuevo', 'Los Pepines', 'Gurabito', 'Villa Olga', 'La Trinitaria',
     'Cerros de Gurabo', 'Gurabo', 'Llanos de Gurabo', 'La Esmeralda', 'Jardines Metropolitanos', 'Thomen',
     'Villa María', 'La Salle', 'Ensanche Libertad'))
);

alter table public.jobs add constraint jobs_zone_by_city check (
  (city = 'santo_domingo' and zone in ('Piantini', 'Naco', 'Bella Vista', 'Gazcue', 'Serrallés', 'Ciudad Colonial',
     'Los Cacicazgos', 'Evaristo Morales', 'Mirador Norte', 'Mirador Sur', 'Villa Juana', 'Los Prados',
     'Arroyo Hondo', 'Ensanche Ozama', 'Los Mina'))
  or
  (city = 'santiago' and zone in ('Centro', 'Pueblo Nuevo', 'Los Pepines', 'Gurabito', 'Villa Olga', 'La Trinitaria',
     'Cerros de Gurabo', 'Gurabo', 'Llanos de Gurabo', 'La Esmeralda', 'Jardines Metropolitanos', 'Thomen',
     'Villa María', 'La Salle', 'Ensanche Libertad'))
);

-- 5. City-aware discovery index.
create index if not exists pros_city_trade_zone_idx
  on public.pros (city, trade, zone)
  where verification_status = 'approved';

-- 6. Search takes a city. Default keeps the current Santo Domingo callers working.
drop function if exists public.list_pro_cards(text, text, uuid);
create function public.list_pro_cards(p_trade text default null, p_zone text default null,
                                      p_pro_id uuid default null, p_city text default 'santo_domingo')
returns table(id uuid, full_name text, trade text, zone text, price_min_dop integer, price_max_dop integer,
              plan text, verified_at timestamptz, avatar_path text, bio text, identity_verified boolean,
              email_verified boolean, phone_verified boolean, available boolean)
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
         p.available
  from public.pros p
  join public.profiles pr on pr.id = p.id
  where p.verification_status = 'approved'
    and p.city = p_city
    and (p_trade is null or p.trade = p_trade)
    and (p_zone is null or p.zone = p_zone)
    and (p_pro_id is null or p.id = p_pro_id)
  order by p.verified_at desc nulls last
  limit 50;
$$;

drop function if exists public.boosted_pro_ids(text, text);
create function public.boosted_pro_ids(p_trade text default null, p_zone text default null,
                                       p_city text default 'santo_domingo')
returns table(pro_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.pro_id, b.starts_at
    from public.boosts b
    join public.pros p on p.id = b.pro_id
   where b.status = 'active'
     and b.ends_at > now()
     and p.verification_status = 'approved'
     and p.suspended_at is null
     and p.city = p_city
     and (p_trade is null or p.trade = p_trade)
     and (p_zone is null or p.zone = p_zone)
   order by b.starts_at desc
   limit 3;
$$;

-- 7. Grants match the originals (anon and authenticated can search; service_role for admin tools).
grant execute on function public.list_pro_cards(text, text, uuid, text) to anon, authenticated, service_role;
grant execute on function public.boosted_pro_ids(text, text, text) to anon, authenticated, service_role;
