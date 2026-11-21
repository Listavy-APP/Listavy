-- 0112: search ladder, invite place, service requests, admin province filter (Item 10, Part 3).
-- Ladder tiers: 1 same municipality, 2 same province, 3 within 60 km, 4 rest of the country.
-- Tiers 3 and 4 appear only when tiers 1 and 2 return fewer than 5 pros.
-- Distances come from approximate seat centroids: ordering and labels only, never shown as exact.
-- list_pro_cards keeps its by-id and city contract.

-- 1. Search ladder ---------------------------------------------------------------
create or replace function public.search_pros_ladder(
  p_trade text,
  p_municipality_id uuid,
  p_limit integer default 20
)
returns table (pro_id uuid, tier integer, municipality_id uuid, municipality_name text, province text, approx_km numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_municipality_id is null or not exists (select 1 from public.municipalities where id = p_municipality_id) then
    raise exception 'Municipio no válido.' using errcode = '22023';
  end if;
  return query
  with origin as (
    select m.id, m.province, m.lat, m.lng from public.municipalities m where m.id = p_municipality_id
  ),
  cands as (
    select p.id as pro_id, m.id as mid, m.name as mname, m.province as mprov, m.lat, m.lng
      from public.pros p
      join public.municipalities m on m.id = p.municipality_id
     where p.verification_status = 'approved'
       and p.closed_at is null
       and not p.is_demo
       and (p_trade is null or p.trade = p_trade)
  ),
  scored as (
    select c.pro_id, c.mid, c.mname, c.mprov,
           case when c.mid = o.id then 1 when c.mprov = o.province then 2 else 0 end as near,
           round((12742 * asin(sqrt(least(1,
             power(sin(radians(c.lat - o.lat) / 2), 2)
             + cos(radians(o.lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - o.lng) / 2), 2)
           ))))::numeric, 1) as km
      from cands c cross join origin o
  ),
  near_set as (
    select s.*, case when s.near = 1 then 1 else 2 end as t from scored s where s.near > 0
  ),
  far_set as (
    select s.*, case when s.km <= 60 then 3 else 4 end as t from scored s where s.near = 0
  ),
  widened as (
    select f.* from far_set f where (select count(*) from near_set) < 5
  ),
  ladder as (
    select * from near_set union all select * from widened
  )
  select l.pro_id, l.t, l.mid, l.mname, l.mprov,
         case when l.t = 1 then null else l.km end
    from ladder l
   order by l.t, l.km nulls first, l.pro_id
   limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke all on function public.search_pros_ladder(text, uuid, integer) from public;
grant execute on function public.search_pros_ladder(text, uuid, integer) to anon, authenticated;

-- 2. Invite place: a pro sees where the job is before accepting ---------------------
create or replace function public.invite_place(p_quote uuid)
returns table (municipality_name text, province text, approx_km numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  return query
  select jm.name, jm.province,
         round((12742 * asin(sqrt(least(1,
           power(sin(radians(jm.lat - pm.lat) / 2), 2)
           + cos(radians(pm.lat)) * cos(radians(jm.lat)) * power(sin(radians(jm.lng - pm.lng) / 2), 2)
         ))))::numeric, 1)
    from public.quotes q
    join public.jobs j on j.id = q.job_id
    join public.municipalities jm on jm.id = j.municipality_id
    join public.pros p on p.id = q.pro_id
    join public.municipalities pm on pm.id = p.municipality_id
   where q.id = p_quote and q.pro_id = v_uid;
end;
$$;

revoke all on function public.invite_place(uuid) from public, anon;
grant execute on function public.invite_place(uuid) to authenticated;

-- 3. Service requests: "Pide este servicio" (sign-in required, admin reads) ---------
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trade text not null references public.trades (key),
  municipality_id uuid not null references public.municipalities (id),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  phone text not null check (char_length(btrim(phone)) between 7 and 20),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;
create policy service_requests_insert_own on public.service_requests
  for insert to authenticated with check (requester_id = auth.uid());
create policy service_requests_admin_read on public.service_requests
  for select to authenticated using (public.is_admin());
revoke all on public.service_requests from anon, authenticated;
grant insert on public.service_requests to authenticated;
grant select on public.service_requests to authenticated;

-- 4. Admin pros list gains a province filter (signature change: old 3-arg version dropped)
drop function if exists public.admin_list_approved_pros(text, text, text);
create function public.admin_list_approved_pros(p_search text default null, p_city text default null,
                                                p_trade text default null, p_province text default null)
returns table (
  id uuid,
  full_name text,
  trade text,
  zone text,
  city text,
  municipality_name text,
  province text,
  plan text,
  available boolean,
  is_demo boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pattern text;
begin
  if not public.is_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  v_pattern := '%' || replace(replace(replace(coalesce(trim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, pr.full_name, p.trade, p.zone, p.city, m.name, m.province, p.plan, p.available, p.is_demo
    from public.pros p
    left join public.profiles pr on pr.id = p.id
    left join public.municipalities m on m.id = p.municipality_id
    where p.verification_status = 'approved'
      and p.closed_at is null
      and (p_city is null or p.city = p_city)
      and (p_trade is null or p.trade = p_trade)
      and (p_province is null or m.province = p_province)
      and (coalesce(trim(p_search), '') = '' or pr.full_name ilike v_pattern)
    order by pr.full_name nulls last, p.id
    limit 200;
end;
$$;
revoke all on function public.admin_list_approved_pros(text, text, text, text) from public, anon;
grant execute on function public.admin_list_approved_pros(text, text, text, text) to authenticated;
