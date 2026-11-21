-- 0109: trades become a catalog table (Item 10, Part 1).
-- Why: a trade created by an admin (Part 4) must be a normal trade everywhere. A hard-coded
-- check list cannot grow at runtime. Adds the eleven approved trades and replaces the three
-- trade check constraints (jobs, pros, recurring_bookings) with a foreign key to trades.key.
-- Clients read active trades only. Writes go through admin_upsert_trade (super admin + reason).
-- Redefines get_price_guides to read from the catalog instead of its literal list.

-- 1. Table ------------------------------------------------------------------
create table if not exists public.trades (
  key text primary key check (key ~ '^[a-z][a-z_]{1,39}$'),
  label_es text not null check (length(label_es) between 2 and 60),
  -- Professional name, shown where a person is named ("Plomero"). Null means use label_es.
  -- The seven existing trades keep their exact display strings in both columns.
  pro_label_es text check (pro_label_es is null or length(pro_label_es) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  specialties text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 1000,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.trades enable row level security;

drop policy if exists trades_read_active on public.trades;
create policy trades_read_active on public.trades
  for select using (active);

revoke insert, update, delete on public.trades from anon, authenticated;
grant select on public.trades to anon, authenticated;

-- 2. Seed: the seven existing trades, then the eleven new ones --------------
insert into public.trades (key, label_es, pro_label_es, slug, specialties) values
  ('plumber', 'Plomería', 'Plomero', 'plomeria', '{}'),
  ('electrician', 'Electricidad', 'Electricista', 'electricidad', '{}'),
  ('ac_technician', 'Aire acondicionado', 'Técnico de aire acondicionado', 'aire-acondicionado', '{}'),
  ('painter', 'Pintura', 'Pintor', 'pintura', '{}'),
  ('locksmith', 'Cerrajería', 'Cerrajero', 'cerrajeria', '{}'),
  ('carpenter', 'Carpintería', 'Carpintero', 'carpinteria', '{}'),
  ('blacksmith', 'Herrería', 'Herrero', 'herreria', '{}'),
  ('cleaning', 'Limpieza', null, 'limpieza',
     array['Limpieza de hogar', 'Limpieza profunda', 'Post-construcción', 'Cisternas y tinacos', 'Lavandería y planchado']),
  ('energy_backup', 'Energía y respaldo', null, 'energia-y-respaldo',
     array['Inversores y baterías', 'Plantas eléctricas y generadores', 'Paneles solares']),
  ('construction', 'Construcción y remodelación', null, 'construccion-y-remodelacion',
     array['Albañilería', 'Pisos y cerámicas', 'Sheetrock y plafones', 'Impermeabilización']),
  ('tech_install', 'Tecnología e instalaciones', null, 'tecnologia-e-instalaciones',
     array['Cámaras de seguridad', 'TV y sonido']),
  ('exteriors', 'Exteriores', null, 'exteriores',
     array['Jardinería', 'Mantenimiento de piscinas']),
  ('pest_control', 'Fumigación y control de plagas', null, 'fumigacion', '{}'),
  ('appliance_repair', 'Reparación de electrodomésticos', null, 'electrodomesticos', '{}'),
  ('moving', 'Mudanzas y fletes', null, 'mudanzas', '{}'),
  ('glass_windows', 'Vidrios y ventanas', null, 'vidrios-y-ventanas', '{}'),
  ('upholstery', 'Tapicería', null, 'tapiceria', '{}'),
  ('handyman', 'Servicios generales', null, 'servicios-generales', '{}')
on conflict (key) do nothing;

-- Display order: today's order for the seven existing trades, then the new lines.
update public.trades set sort_order = case key
  when 'plumber' then 1 when 'electrician' then 2 when 'ac_technician' then 3 when 'painter' then 4
  when 'locksmith' then 5 when 'carpenter' then 6 when 'blacksmith' then 7 when 'cleaning' then 8
  when 'energy_backup' then 9 when 'construction' then 10 when 'tech_install' then 11 when 'exteriors' then 12
  when 'pest_control' then 13 when 'appliance_repair' then 14 when 'moving' then 15 when 'glass_windows' then 16
  when 'upholstery' then 17 when 'handyman' then 18 else 1000 end;

-- 3. Foreign keys replace the literal check lists ----------------------------
alter table public.jobs drop constraint if exists jobs_trade_check;
alter table public.pros drop constraint if exists pros_trade_check;
alter table public.recurring_bookings drop constraint if exists recurring_bookings_trade_check;

alter table public.jobs add constraint jobs_trade_fk foreign key (trade) references public.trades (key);
alter table public.pros add constraint pros_trade_fk foreign key (trade) references public.trades (key);
alter table public.recurring_bookings add constraint recurring_bookings_trade_fk
  foreign key (trade) references public.trades (key);

-- 4. Super-admin write path --------------------------------------------------
create or replace function public.admin_upsert_trade(
  p_key text, p_label_es text, p_slug text, p_specialties text[], p_reason text)
returns public.trades
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.trades;
  v_specialties text[] := coalesce(p_specialties, '{}');
begin
  if (select auth.uid()) is null or not public.is_admin() or not public.is_super_admin() then
    raise exception 'Solo un super administrador puede editar el catálogo.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Escribe el motivo (mínimo 10 caracteres).' using errcode = '22023';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z_]{1,39}$' then
    raise exception 'Clave de oficio no válida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.trades where key = p_key) then
    raise exception 'Ese oficio ya existe.' using errcode = '22023';
  end if;
  insert into public.trades (key, label_es, slug, specialties, created_by)
    values (p_key, trim(p_label_es), p_slug, v_specialties, (select auth.uid()))
    returning * into v_row;
  perform public.admin_log('trade_created', null,
    jsonb_build_object('key', v_row.key, 'label_es', v_row.label_es, 'slug', v_row.slug, 'reason', trim(p_reason)));
  return v_row;
end;
$$;

revoke all on function public.admin_upsert_trade(text, text, text, text[], text) from public, anon;
grant execute on function public.admin_upsert_trade(text, text, text, text[], text) to authenticated;

-- 5. Price guides read the catalog (same output shape as 0094) --------------
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
  with catalog(trade) as (
    select t.key from public.trades t where t.active
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
  select c.trade,
         coalesce(a.sample, 0) as sample,
         case when coalesce(a.sample, 0) >= 3 then a.low_dop end as low_dop,
         case when coalesce(a.sample, 0) >= 3 then a.high_dop end as high_dop
  from catalog c
  left join agg a on a.trade = c.trade
  order by c.trade;
$$;

revoke all on function public.get_price_guides() from public;
grant execute on function public.get_price_guides() to anon, authenticated;
