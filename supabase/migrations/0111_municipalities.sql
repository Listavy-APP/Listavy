-- 0111: municipalities (Item 10, Part 2). Municipality becomes the source of truth for place.
-- Why: 158 municipalities across 32 province-level units, from the approved seed (CSV, Sam, 2026-11-21).
-- Coordinates are approximate seat centroids. They order results by distance and are never shown as exact.
-- city becomes legacy-only: it mirrors the municipality for the four original markets and stays null elsewhere.
-- Sector (zone) is free text at the database. The curated zone lists remain UI suggestions.
-- Search widening (ladder) comes in 0112. list_pro_cards keeps its by-id and city contract.

-- 1. Reference table --------------------------------------------------------
create table if not exists public.municipalities (
  id uuid primary key default gen_random_uuid(),
  province text not null,
  name text not null,
  display_name text not null,
  lat numeric(7, 4) not null check (lat between 17 and 20.5),
  lng numeric(7, 4) not null check (lng between -72.5 and -68),
  legacy_city text unique check (legacy_city in ('santo_domingo', 'santiago', 'puerto_plata', 'la_romana')),
  unique (province, name)
);

alter table public.municipalities enable row level security;
drop policy if exists municipalities_read on public.municipalities;
create policy municipalities_read on public.municipalities for select using (true);
revoke insert, update, delete on public.municipalities from anon, authenticated;
grant select on public.municipalities to anon, authenticated;

insert into public.municipalities (province, name, display_name, lat, lng) values
  ('Azua', 'Azua de Compostela', 'Azua', 18.453, -70.735),
  ('Azua', 'Estebanía', 'Estebanía', 18.45, -70.85),
  ('Azua', 'Guayabal', 'Guayabal', 18.75, -70.833),
  ('Azua', 'Las Charcas', 'Las Charcas', 18.383, -70.617),
  ('Azua', 'Las Yayas de Viajama', 'Las Yayas de Viajama', 18.6, -70.917),
  ('Azua', 'Padre Las Casas', 'Padre Las Casas', 18.733, -70.867),
  ('Azua', 'Peralta', 'Peralta', 18.583, -70.783),
  ('Azua', 'Pueblo Viejo', 'Pueblo Viejo', 18.4, -70.767),
  ('Azua', 'Sabana Yegua', 'Sabana Yegua', 18.45, -70.65),
  ('Azua', 'Tábara Arriba', 'Tábara Arriba', 18.567, -70.883),
  ('Bahoruco', 'Galván', 'Galván', 18.517, -71.333),
  ('Bahoruco', 'Los Ríos', 'Los Ríos', 18.517, -71.233),
  ('Bahoruco', 'Neiba', 'Neiba', 18.483, -71.417),
  ('Bahoruco', 'Tamayo', 'Tamayo', 18.4, -71.2),
  ('Bahoruco', 'Villa Jaragua', 'Villa Jaragua', 18.483, -71.3),
  ('Barahona', 'Barahona', 'Barahona', 18.2, -71.1),
  ('Barahona', 'Cabral', 'Cabral', 18.25, -71.217),
  ('Barahona', 'El Peñón', 'El Peñón', 18.283, -71.183),
  ('Barahona', 'Enriquillo', 'Enriquillo', 17.9, -71.233),
  ('Barahona', 'Fundación', 'Fundación', 18.283, -71.283),
  ('Barahona', 'Jaquimeyes', 'Jaquimeyes', 18.417, -71.167),
  ('Barahona', 'La Ciénaga', 'La Ciénaga', 17.983, -71.117),
  ('Barahona', 'Las Salinas', 'Las Salinas', 18.267, -71.317),
  ('Barahona', 'Paraíso', 'Paraíso', 17.95, -71.167),
  ('Barahona', 'Polo', 'Polo', 18.083, -71.283),
  ('Barahona', 'Vicente Noble', 'Vicente Noble', 18.383, -71.183),
  ('Dajabón', 'Dajabón', 'Dajabón', 19.55, -71.7),
  ('Dajabón', 'El Pino', 'El Pino', 19.417, -71.517),
  ('Dajabón', 'Loma de Cabrera', 'Loma de Cabrera', 19.433, -71.617),
  ('Dajabón', 'Partido', 'Partido', 19.483, -71.55),
  ('Dajabón', 'Restauración', 'Restauración', 19.317, -71.7),
  ('Distrito Nacional', 'Santo Domingo de Guzmán', 'Distrito Nacional', 18.467, -69.9),
  ('Duarte', 'Arenoso', 'Arenoso', 19.183, -69.633),
  ('Duarte', 'Castillo', 'Castillo', 19.233, -70.033),
  ('Duarte', 'Eugenio María de Hostos', 'Hostos', 19.15, -70.017),
  ('Duarte', 'Las Guáranas', 'Las Guáranas', 19.2, -70.217),
  ('Duarte', 'Pimentel', 'Pimentel', 19.183, -70.1),
  ('Duarte', 'San Francisco de Macorís', 'San Francisco de Macorís', 19.3, -70.25),
  ('Duarte', 'Villa Riva', 'Villa Riva', 19.167, -69.917),
  ('El Seibo', 'El Seibo', 'El Seibo', 18.767, -69.033),
  ('El Seibo', 'Miches', 'Miches', 18.983, -69.05),
  ('Elías Piña', 'Bánica', 'Bánica', 19.083, -71.7),
  ('Elías Piña', 'Comendador', 'Comendador', 19.05, -71.7),
  ('Elías Piña', 'El Llano', 'El Llano', 19.0, -71.633),
  ('Elías Piña', 'Hondo Valle', 'Hondo Valle', 18.917, -71.7),
  ('Elías Piña', 'Juan Santiago', 'Juan Santiago', 18.983, -71.583),
  ('Elías Piña', 'Pedro Santana', 'Pedro Santana', 19.1, -71.617),
  ('Espaillat', 'Cayetano Germosén', 'Cayetano Germosén', 19.367, -70.467),
  ('Espaillat', 'Gaspar Hernández', 'Gaspar Hernández', 19.617, -70.283),
  ('Espaillat', 'Jamao al Norte', 'Jamao al Norte', 19.633, -70.433),
  ('Espaillat', 'Moca', 'Moca', 19.383, -70.517),
  ('Espaillat', 'San Víctor', 'San Víctor', 19.45, -70.467),
  ('Hato Mayor', 'El Valle', 'El Valle', 18.983, -69.383),
  ('Hato Mayor', 'Hato Mayor del Rey', 'Hato Mayor', 18.767, -69.267),
  ('Hato Mayor', 'Sabana de la Mar', 'Sabana de la Mar', 19.1, -69.383),
  ('Hermanas Mirabal', 'Salcedo', 'Salcedo', 19.383, -70.417),
  ('Hermanas Mirabal', 'Tenares', 'Tenares', 19.367, -70.3),
  ('Hermanas Mirabal', 'Villa Tapia', 'Villa Tapia', 19.3, -70.417),
  ('Independencia', 'Cristóbal', 'Cristóbal', 18.283, -71.283),
  ('Independencia', 'Duvergé', 'Duvergé', 18.367, -71.517),
  ('Independencia', 'Jimaní', 'Jimaní', 18.483, -71.85),
  ('Independencia', 'La Descubierta', 'La Descubierta', 18.567, -71.717),
  ('Independencia', 'Mella', 'Mella', 18.367, -71.4),
  ('Independencia', 'Postrer Río', 'Postrer Río', 18.533, -71.633),
  ('La Altagracia', 'Higüey', 'Higüey', 18.617, -68.717),
  ('La Altagracia', 'San Rafael del Yuma', 'San Rafael del Yuma', 18.433, -68.667),
  ('La Romana', 'Guaymate', 'Guaymate', 18.583, -68.983),
  ('La Romana', 'La Romana', 'La Romana', 18.417, -68.967),
  ('La Romana', 'Villa Hermosa', 'Villa Hermosa', 18.583, -68.9),
  ('La Vega', 'Constanza', 'Constanza', 18.917, -70.75),
  ('La Vega', 'Jarabacoa', 'Jarabacoa', 19.117, -70.633),
  ('La Vega', 'Jima Abajo', 'Jima Abajo', 19.133, -70.367),
  ('La Vega', 'La Vega', 'La Vega', 19.217, -70.533),
  ('María Trinidad Sánchez', 'Cabrera', 'Cabrera', 19.633, -69.9),
  ('María Trinidad Sánchez', 'El Factor', 'El Factor', 19.317, -69.883),
  ('María Trinidad Sánchez', 'Nagua', 'Nagua', 19.383, -69.85),
  ('María Trinidad Sánchez', 'Río San Juan', 'Río San Juan', 19.633, -70.083),
  ('Monseñor Nouel', 'Bonao', 'Bonao', 18.933, -70.4),
  ('Monseñor Nouel', 'Maimón', 'Maimón', 18.9, -70.317),
  ('Monseñor Nouel', 'Piedra Blanca', 'Piedra Blanca', 18.833, -70.3),
  ('Monte Cristi', 'Castañuelas', 'Castañuelas', 19.717, -71.5),
  ('Monte Cristi', 'Guayubín', 'Guayubín', 19.667, -71.367),
  ('Monte Cristi', 'Las Matas de Santa Cruz', 'Las Matas de Santa Cruz', 19.683, -71.467),
  ('Monte Cristi', 'Monte Cristi', 'Monte Cristi', 19.85, -71.65),
  ('Monte Cristi', 'Pepillo Salcedo', 'Pepillo Salcedo', 19.7, -71.733),
  ('Monte Cristi', 'Villa Vásquez', 'Villa Vásquez', 19.733, -71.45),
  ('Monte Plata', 'Bayaguana', 'Bayaguana', 18.75, -69.633),
  ('Monte Plata', 'Monte Plata', 'Monte Plata', 18.8, -69.783),
  ('Monte Plata', 'Peralvillo', 'Peralvillo', 18.817, -69.7),
  ('Monte Plata', 'Sabana Grande de Boyá', 'Sabana Grande de Boyá', 18.95, -69.783),
  ('Monte Plata', 'Yamasá', 'Yamasá', 18.767, -70.017),
  ('Pedernales', 'Oviedo', 'Oviedo', 17.783, -71.367),
  ('Pedernales', 'Pedernales', 'Pedernales', 18.033, -71.75),
  ('Peravia', 'Baní', 'Baní', 18.283, -70.333),
  ('Peravia', 'Matanzas', 'Matanzas', 18.233, -70.417),
  ('Peravia', 'Nizao', 'Nizao', 18.233, -70.2),
  ('Puerto Plata', 'Altamira', 'Altamira', 19.667, -70.833),
  ('Puerto Plata', 'Guananico', 'Guananico', 19.733, -70.917),
  ('Puerto Plata', 'Imbert', 'Imbert', 19.75, -70.833),
  ('Puerto Plata', 'Los Hidalgos', 'Los Hidalgos', 19.717, -71.033),
  ('Puerto Plata', 'Luperón', 'Luperón', 19.9, -70.95),
  ('Puerto Plata', 'San Felipe de Puerto Plata', 'Puerto Plata', 19.8, -70.683),
  ('Puerto Plata', 'Sosúa', 'Sosúa', 19.767, -70.517),
  ('Puerto Plata', 'Villa Isabela', 'Villa Isabela', 19.817, -71.033),
  ('Puerto Plata', 'Villa Montellano', 'Villa Montellano', 19.783, -70.6),
  ('Samaná', 'Las Terrenas', 'Las Terrenas', 19.317, -69.533),
  ('Samaná', 'Samaná', 'Samaná', 19.2, -69.333),
  ('Samaná', 'Sánchez', 'Sánchez', 19.233, -69.617),
  ('San Cristóbal', 'Bajos de Haina', 'Bajos de Haina', 18.417, -70.017),
  ('San Cristóbal', 'Cambita Garabitos', 'Cambita Garabitos', 18.45, -70.183),
  ('San Cristóbal', 'Los Cacaos', 'Los Cacaos', 18.517, -70.283),
  ('San Cristóbal', 'Sabana Grande de Palenque', 'Palenque', 18.25, -70.15),
  ('San Cristóbal', 'San Cristóbal', 'San Cristóbal', 18.417, -70.117),
  ('San Cristóbal', 'San Gregorio de Nigua', 'Nigua', 18.383, -70.083),
  ('San Cristóbal', 'Villa Altagracia', 'Villa Altagracia', 18.667, -70.167),
  ('San Cristóbal', 'Yaguate', 'Yaguate', 18.333, -70.183),
  ('San José de Ocoa', 'Rancho Arriba', 'Rancho Arriba', 18.717, -70.467),
  ('San José de Ocoa', 'Sabana Larga', 'Sabana Larga', 18.583, -70.5),
  ('San José de Ocoa', 'San José de Ocoa', 'San José de Ocoa', 18.55, -70.5),
  ('San Juan', 'Bohechío', 'Bohechío', 18.8, -70.983),
  ('San Juan', 'El Cercado', 'El Cercado', 18.717, -71.517),
  ('San Juan', 'Juan de Herrera', 'Juan de Herrera', 18.867, -71.233),
  ('San Juan', 'Las Matas de Farfán', 'Las Matas de Farfán', 18.867, -71.517),
  ('San Juan', 'San Juan de la Maguana', 'San Juan de la Maguana', 18.817, -71.233),
  ('San Juan', 'Vallejuelo', 'Vallejuelo', 18.65, -71.333),
  ('San Pedro de Macorís', 'Consuelo', 'Consuelo', 18.55, -69.3),
  ('San Pedro de Macorís', 'Guayacanes', 'Guayacanes', 18.45, -69.45),
  ('San Pedro de Macorís', 'Ingenio Quisqueya', 'Quisqueya', 18.55, -69.4),
  ('San Pedro de Macorís', 'Ramón Santana', 'Ramón Santana', 18.533, -69.183),
  ('San Pedro de Macorís', 'San José de los Llanos', 'Los Llanos', 18.617, -69.483),
  ('San Pedro de Macorís', 'San Pedro de Macorís', 'San Pedro de Macorís', 18.45, -69.3),
  ('Sánchez Ramírez', 'Cevicos', 'Cevicos', 19.0, -70.017),
  ('Sánchez Ramírez', 'Cotuí', 'Cotuí', 19.05, -70.15),
  ('Sánchez Ramírez', 'Fantino', 'Fantino', 19.117, -70.3),
  ('Sánchez Ramírez', 'La Mata', 'La Mata', 19.1, -70.167),
  ('Santiago', 'Baitoa', 'Baitoa', 19.317, -70.7),
  ('Santiago', 'Jánico', 'Jánico', 19.333, -70.817),
  ('Santiago', 'Licey al Medio', 'Licey al Medio', 19.433, -70.6),
  ('Santiago', 'Puñal', 'Puñal', 19.4, -70.617),
  ('Santiago', 'Sabana Iglesia', 'Sabana Iglesia', 19.317, -70.75),
  ('Santiago', 'San José de las Matas', 'San José de las Matas', 19.333, -70.933),
  ('Santiago', 'Santiago de los Caballeros', 'Santiago', 19.45, -70.7),
  ('Santiago', 'Tamboril', 'Tamboril', 19.483, -70.6),
  ('Santiago', 'Villa Bisonó', 'Bisonó', 19.567, -70.867),
  ('Santiago', 'Villa González', 'Villa González', 19.533, -70.783),
  ('Santiago Rodríguez', 'Monción', 'Monción', 19.4, -71.15),
  ('Santiago Rodríguez', 'San Ignacio de Sabaneta', 'Sabaneta', 19.483, -71.233),
  ('Santiago Rodríguez', 'Villa Los Almácigos', 'Villa Los Almácigos', 19.417, -71.433),
  ('Santo Domingo', 'Boca Chica', 'Boca Chica', 18.45, -69.6),
  ('Santo Domingo', 'Los Alcarrizos', 'Los Alcarrizos', 18.517, -69.983),
  ('Santo Domingo', 'Pedro Brand', 'Pedro Brand', 18.567, -70.083),
  ('Santo Domingo', 'San Antonio de Guerra', 'Guerra', 18.55, -69.7),
  ('Santo Domingo', 'Santo Domingo Este', 'Santo Domingo Este', 18.483, -69.867),
  ('Santo Domingo', 'Santo Domingo Norte', 'Santo Domingo Norte', 18.55, -69.883),
  ('Santo Domingo', 'Santo Domingo Oeste', 'Santo Domingo Oeste', 18.483, -69.983),
  ('Valverde', 'Esperanza', 'Esperanza', 19.583, -70.983),
  ('Valverde', 'Laguna Salada', 'Laguna Salada', 19.65, -71.083),
  ('Valverde', 'Mao', 'Mao', 19.55, -71.083)
on conflict (province, name) do nothing;

-- The four original markets map to their municipality.
update public.municipalities set legacy_city = 'santo_domingo' where province = 'Distrito Nacional' and name = 'Santo Domingo de Guzmán';
update public.municipalities set legacy_city = 'santiago' where province = 'Santiago' and name = 'Santiago de los Caballeros';
update public.municipalities set legacy_city = 'puerto_plata' where province = 'Puerto Plata' and name = 'San Felipe de Puerto Plata';
update public.municipalities set legacy_city = 'la_romana' where province = 'La Romana' and name = 'La Romana';

-- 2. Columns: municipality on pros, jobs, and recurring series -----------------
alter table public.pros add column if not exists municipality_id uuid references public.municipalities (id);
alter table public.jobs add column if not exists municipality_id uuid references public.municipalities (id);
alter table public.recurring_bookings add column if not exists municipality_id uuid references public.municipalities (id);

-- 3. Constraints that tied city and zone together are removed --------------
alter table public.pros drop constraint if exists pros_city_valid;
alter table public.jobs drop constraint if exists jobs_city_valid;
alter table public.pros drop constraint if exists pros_zone_by_city;
alter table public.jobs drop constraint if exists jobs_zone_by_city;

alter table public.pros alter column city drop default;
alter table public.pros alter column city drop not null;
alter table public.jobs alter column city drop default;
alter table public.jobs alter column city drop not null;
alter table public.pros add constraint pros_city_legacy check (city is null or city in ('santo_domingo', 'santiago', 'puerto_plata', 'la_romana'));
alter table public.jobs add constraint jobs_city_legacy check (city is null or city in ('santo_domingo', 'santiago', 'puerto_plata', 'la_romana'));

-- 4. Backfill existing rows to their market's municipality ------------------
update public.pros p set municipality_id = m.id
  from public.municipalities m
 where m.legacy_city = p.city and p.municipality_id is null;
update public.jobs j set municipality_id = m.id
  from public.municipalities m
 where m.legacy_city = j.city and j.municipality_id is null;
update public.recurring_bookings r set municipality_id = m.id
  from public.municipalities m
 where m.legacy_city = public.city_of_zone(r.zone) and r.municipality_id is null;

-- 5. City follows the municipality (replaces the zone-to-city triggers) ------
create or replace function public.sync_city_from_municipality()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.municipality_id is not null then
    select m.legacy_city into new.city from public.municipalities m where m.id = new.municipality_id;
  end if;
  return new;
end;
$$;

drop trigger if exists pros_set_city on public.pros;
drop trigger if exists jobs_set_city on public.jobs;
drop function if exists public.set_city_from_zone();

drop trigger if exists pros_sync_city on public.pros;
create trigger pros_sync_city before insert or update of municipality_id on public.pros
  for each row execute function public.sync_city_from_municipality();
drop trigger if exists jobs_sync_city on public.jobs;
create trigger jobs_sync_city before insert or update of municipality_id on public.jobs
  for each row execute function public.sync_city_from_municipality();

-- 6. Redefined functions (each copied from its latest definition; changes marked 0111) ---
-- guard_pro_privileges: city is written by the municipality sync; only a client write is refused.
create or replace function public.guard_pro_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       and not (old.verification_status = 'rejected' and new.verification_status = 'pending' and old.closed_at is null) then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.plan is distinct from old.plan
       or new.plan_stripe_subscription_id is distinct from old.plan_stripe_subscription_id
       or new.plan_current_period_end is distinct from old.plan_current_period_end
       or new.plan_activated_at is distinct from old.plan_activated_at
       or new.closed_at is distinct from old.closed_at
       or new.suspended_at is distinct from old.suspended_at
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.is_demo is distinct from old.is_demo then
      raise exception 'Solo un administrador puede verificar, suspender o cambiar el plan.';
    end if;
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.trade is distinct from old.trade
       or (new.city is distinct from old.city and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on')
       or new.pro_type is distinct from old.pro_type then
      raise exception 'Solo un administrador puede cambiar estos datos.';
    end if;
    -- Price and zone: owner writes only through pro_update_pricing_zone, which sets the flag.
    if (new.zone is distinct from old.zone
        or new.price_min_dop is distinct from old.price_min_dop
        or new.price_max_dop is distinct from old.price_max_dop)
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'Solo un administrador puede cambiar estos datos.';
    end if;
    if new.municipality_id is distinct from old.municipality_id
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'Solo puedes cambiar tu municipio desde tu perfil.';
    end if;
    if new.rejection_reason is distinct from old.rejection_reason
       and not (new.verification_status = 'pending' and new.rejection_reason is null) then
      raise exception 'Solo un administrador puede registrar el motivo.';
    end if;
    if new.pro_free_until is distinct from old.pro_free_until
       and coalesce(current_setting('listavy.pro_internal', true), '') <> 'on' then
      raise exception 'El mes gratis lo asigna Listavy.';
    end if;
  end if;
  return new;
end;
$$;;

-- Pro signup: municipality is required (legacy zone fallback for older callers).
drop function if exists public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text);
create or replace function public.create_pro_application(
  p_full_name    text,
  p_trade        text,
  p_zone         text,
  p_price_min    integer,
  p_price_max    integer,
  p_pro_type     text,
  p_id_path      text,
  p_work_paths   text[],
  p_company_path text,
  p_razon_social text,
  p_rnc          text,
  p_avatar_path  text default null,
  p_custom_line  text default null,
  p_municipality_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  work_path text;
  v_line text := nullif(trim(coalesce(p_custom_line, '')), '');
  v_mun uuid;
begin
  if uid is null then
    raise exception 'Debes entrar primero.';
  end if;
  if p_pro_type not in ('individual', 'company') then
    raise exception 'Tipo de profesional no válido.';
  end if;
  if p_work_paths is null or cardinality(p_work_paths) not between 1 and 3 then
    raise exception 'Sube entre 1 y 3 fotos de trabajos.';
  end if;
  if p_pro_type = 'company' and (p_company_path is null or p_razon_social is null or p_rnc is null) then
    raise exception 'Faltan los datos de la empresa.';
  end if;
  if p_pro_type = 'individual' and (p_company_path is not null or p_razon_social is not null or p_rnc is not null) then
    raise exception 'Los profesionales físicos no envían datos de empresa.';
  end if;
  if v_line is not null and p_pro_type <> 'company' then
    raise exception 'Solo las empresas pueden escribir su giro.' using errcode = '22023';
  end if;
  if p_avatar_path is not null and split_part(p_avatar_path, '/', 1) <> uid::text then
    raise exception 'La foto de perfil debe estar en tu carpeta.';
  end if;

  -- Place (0111): the pro's municipality. Older callers fall back to the legacy market of the zone.
  v_mun := coalesce(p_municipality_id, (select m.id from public.municipalities m where m.legacy_city = public.city_of_zone(p_zone)));
  if v_mun is null then raise exception 'Elige tu municipio.' using errcode = '22023'; end if;

  update public.profiles set full_name = p_full_name where id = uid;

  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, pro_type, custom_line, municipality_id)
    values (uid, p_trade, p_zone, p_price_min, p_price_max, p_pro_type, v_line, v_mun);

  if p_pro_type = 'company' then
    insert into public.pro_companies (pro_id, razon_social, rnc)
      values (uid, p_razon_social, p_rnc);
  end if;

  insert into public.pro_files (pro_id, kind, storage_path)
    values (uid, 'id_document', p_id_path);
  foreach work_path in array p_work_paths loop
    insert into public.pro_files (pro_id, kind, storage_path)
      values (uid, 'work_photo', work_path);
  end loop;
  if p_pro_type = 'company' then
    insert into public.pro_files (pro_id, kind, storage_path)
      values (uid, 'company_document', p_company_path);
  end if;
  if p_avatar_path is not null then
    insert into public.pro_files (pro_id, kind, storage_path)
      values (uid, 'avatar', p_avatar_path);
  end if;
end;
$$;;
revoke execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_pro_application(text, text, text, integer, integer, text, text, text[], text, text, text, text, text, uuid) to authenticated;

-- Pro profile: sector is free text; municipality can be chosen here.
drop function if exists public.pro_update_pricing_zone(integer, integer, text);
create or replace function public.pro_update_pricing_zone(p_price_min integer, p_price_max integer, p_zone text, p_municipality_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inicia sesión para editar tu perfil.' using errcode = '42501';
  end if;
  if p_price_min is null or p_price_max is null or p_price_min < 0 or p_price_max < p_price_min then
    raise exception 'Rango de precios no válido.' using errcode = '22023';
  end if;
  -- Sector is free text (0111). Only its length is checked here.
  if p_zone is null or char_length(btrim(p_zone)) not between 2 and 60 then
    raise exception 'Escribe tu sector (entre 2 y 60 caracteres).' using errcode = '22023';
  end if;
  if p_municipality_id is not null and not exists (select 1 from public.municipalities where id = p_municipality_id) then
    raise exception 'Municipio no válido.' using errcode = '22023';
  end if;

  perform set_config('listavy.pro_internal', 'on', true);
  update public.pros
     set price_min_dop = p_price_min,
         price_max_dop = p_price_max,
         zone = btrim(p_zone),
         municipality_id = coalesce(p_municipality_id, municipality_id)
   where id = v_uid;
  if not found then
    raise exception 'No hay perfil de profesional.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.pro_update_pricing_zone(integer, integer, text, uuid) from public, anon;
grant execute on function public.pro_update_pricing_zone(integer, integer, text, uuid) to authenticated;

-- Job request: municipality param; the city gate is removed.
drop function if exists public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text);
create or replace function public.create_job_request(p_trade text, p_zone text, p_description text, p_job_type text,
                                          p_pro_ids uuid[], p_photo_paths text[], p_voice_path text default null::text,
                                          p_requested_pro_type text default 'any',
                                          p_scheduled_date date default null,
                                          p_scheduled_window text default null,
                                          p_municipality_id uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_pro uuid;
  v_open integer;
  v_unbooked integer;
  v_last_booking timestamptz;
  v_block_from timestamptz;
  v_price_ok boolean;
  v_available boolean;
  v_mun uuid;
  v_is_demo boolean;
  v_pro_type text;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  if p_job_type not in ('repair', 'diagnostic') then raise exception 'Tipo de trabajo no válido.'; end if;
  if p_requested_pro_type is null then
    raise exception 'Elige si buscas persona, empresa o cualquiera.';
  end if;
  if p_requested_pro_type not in ('individual', 'company', 'any') then
    raise exception 'Tipo de profesional no válido.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 20 then
    raise exception 'Describe el problema con al menos 20 caracteres.';
  end if;
  if p_photo_paths is null or cardinality(p_photo_paths) < 1 then
    raise exception 'Agrega al menos una foto del problema.';
  end if;
  if p_pro_ids is null or cardinality(p_pro_ids) < 1 or cardinality(p_pro_ids) > 3 then
    raise exception 'Elige entre 1 y 3 profesionales.';
  end if;
  if (select count(distinct x) from unnest(p_pro_ids) x) <> cardinality(p_pro_ids) then
    raise exception 'Hay profesionales repetidos.';
  end if;

  -- Schedule (0090). NULL, NULL means "Lo antes posible". Otherwise one date and one window.
  if (p_scheduled_date is null) <> (p_scheduled_window is null) then
    raise exception 'Elige fecha y horario, o Lo antes posible.';
  end if;
  if p_scheduled_date is not null then
    if p_scheduled_window not in ('morning', 'afternoon', 'evening') then
      raise exception 'Horario no válido.';
    end if;
    if p_scheduled_date < public.santo_domingo_today() then
      raise exception 'La fecha debe ser hoy o posterior.';
    end if;
    if p_scheduled_date > public.santo_domingo_today() + 60 then
      raise exception 'Puedes agendar hasta 60 días después de hoy.';
    end if;
  end if;

  select max(booked_at) into v_last_booking from public.jobs where homeowner_id = v_uid;
  select count(*) into v_unbooked from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted')
     and created_at > now() - interval '30 days'
     and (v_last_booking is null or created_at > v_last_booking);
  if v_unbooked >= 5 then
    select created_at into v_block_from from public.jobs
     where homeowner_id = v_uid and status in ('requested', 'quoted')
       and created_at > now() - interval '30 days'
       and (v_last_booking is null or created_at > v_last_booking)
     order by created_at desc offset 4 limit 1;
    if now() < v_block_from + interval '14 days' then
      raise exception 'Tienes demasiadas solicitudes sin contratar. Puedes pedir cotizaciones de nuevo en 14 días.';
    end if;
  end if;

  select count(*) into v_open from public.jobs
   where homeowner_id = v_uid
     and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
  if v_open >= 3 then
    raise exception 'Ya tienes 3 solicitudes abiertas. Cancela una antes de pedir otra.';
  end if;

  foreach v_pro in array p_pro_ids loop
    -- Self-hire guard: a pro cannot request their own services, even when calling this directly.
    if v_pro = v_uid then
      raise exception 'No puedes contratarte a ti mismo. Elige otro profesional.';
    end if;
    select p.available, p.is_demo, p.pro_type into v_available, v_is_demo, v_pro_type
      from public.pros p
     where p.id = v_pro and p.trade = p_trade and p.verification_status = 'approved';
    if not found then raise exception 'Un profesional elegido no está disponible para este oficio.'; end if;
    -- Demo gate (0058): a demonstration profile never receives a request, even when called directly.
    if v_is_demo then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- Availability gate (UI phase §7, item 6).
    if not v_available then raise exception 'Un profesional elegido no está disponible en este momento. Elige otro.'; end if;
    -- City gate removed (0111): a pro's municipality does not restrict a request. The client picks the pro.
    -- Type gate (person vs company, Phase 1). 'any' accepts both.
    if p_requested_pro_type <> 'any' and v_pro_type is distinct from p_requested_pro_type then
      raise exception 'Un profesional elegido no coincide con el tipo que pediste (persona o empresa). Elige otro.';
    end if;
  end loop;

  -- Place (0111): the job's municipality. Older clients without one fall back to the legacy market of the zone.
  v_mun := coalesce(p_municipality_id, (select m.id from public.municipalities m where m.legacy_city = public.city_of_zone(p_zone)));
  if v_mun is null then raise exception 'Elige el municipio donde necesitas el servicio.' using errcode = '22023'; end if;

  insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, voice_path, requested_pro_type,
                           scheduled_date, scheduled_window, municipality_id)
  values (v_uid, p_trade, p_zone, btrim(p_description), 'requested', p_job_type, p_voice_path, p_requested_pro_type,
          p_scheduled_date, p_scheduled_window, v_mun)
  returning id into v_job;

  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
  select v_job, v_uid, 'request', x from unnest(p_photo_paths) x;

  insert into public.quotes (job_id, pro_id, status, invited_at)
  select v_job, x, 'invited', now() from unnest(p_pro_ids) x;

  return v_job;
end;
$function$;;
revoke execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid) from public, anon;
grant execute on function public.create_job_request(text, text, text, text, uuid[], text[], text, text, date, text, uuid) to authenticated;

-- Recurring: the series and its jobs carry the municipality; the city gate is removed.
create or replace function public.run_recurring_bookings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_today date := public.santo_domingo_today();
  v_lead integer := public.recurring_lead_days();
  v_open_ok boolean;
  v_open_requests integer;
  v_job uuid;
  v_created integer := 0;
  v_capped integer := 0;
  v_paused integer := 0;
begin
  for r in
    select * from public.recurring_bookings
     where status = 'active' and next_due_date <= v_today + v_lead
     order by next_due_date, id
     for update skip locked
  loop
    -- Catch-up without backfill: a due date already in the past is advanced, never turned into a request.
    -- After one creation the next due date is always more than the lead time away, so a second run
    -- on the same day finds nothing due.
    if r.next_due_date < v_today then
      update public.recurring_bookings set next_due_date = public.recurring_first_due(frequency, anchor, v_today - 1), updated_at = now()
       where id = r.id;
      continue;
    end if;

    -- Suspended client: pause without a request and without a notice. The account is under review.
    if exists (select 1 from public.client_suspensions where client_id = r.client_id) then
      update public.recurring_bookings set status = 'paused', paused_reason = 'client_suspended', updated_at = now() where id = r.id;
      v_paused := v_paused + 1;
      continue;
    end if;

    -- Pro gate, mirrored from create_job_request. Failing it pauses the series and notifies the client.
    select exists (select 1 from public.pros p
                    where p.id = r.pro_id and p.verification_status = 'approved' and not p.is_demo
                      and p.available and p.trade = r.trade)
      into v_open_ok;
    if not v_open_ok then
      update public.recurring_bookings set status = 'paused', paused_reason = 'pro_unavailable', updated_at = now() where id = r.id;
      perform public.notify_user_push(r.client_id, 'recurring_auto_paused', 'Pausamos tu trabajo recurrente',
        'Tu profesional ya no está disponible para este servicio. Revisa tus trabajos recurrentes.', '/cuenta/recurrentes', false);
      -- Email too: a client whose series stops must not be able to miss it. p_always skips the
      -- job-email preference; the unverified-address rule inside notify_user_email still applies.
      perform public.notify_user_email(r.client_id, 'recurring_auto_paused', jsonb_build_object('trade', r.trade), true, false);
      v_paused := v_paused + 1;
      continue;
    end if;

    -- Standing cap: the same open-status set and limit as create_job_request.
    select count(*) into v_open_requests from public.jobs
     where homeowner_id = r.client_id
       and status in ('requested', 'quoted', 'accepted', 'in_progress', 'awaiting_approval');
    if v_open_requests >= 3 then
      insert into public.recurring_occurrences (series_id, due_date, outcome) values (r.id, r.next_due_date, 'skipped_cap');
      update public.recurring_bookings
         set next_due_date = public.recurring_advance(frequency, anchor, next_due_date), updated_at = now()
       where id = r.id;
      perform public.notify_user_push(r.client_id, 'recurring_skipped_cap', 'No creamos la solicitud de esta vez',
        'Tienes 3 solicitudes abiertas. Cancela una para que la próxima se pueda crear.', '/trabajos', false);
      v_capped := v_capped + 1;
      continue;
    end if;

    -- Create the request. The unique key on recurring_occurrences guards the due date.
    insert into public.jobs (homeowner_id, trade, zone, description, status, job_type, requested_pro_type,
                             scheduled_date, scheduled_window, municipality_id)
    values (r.client_id, r.trade, r.zone, r.description, 'requested', r.job_type, 'any',
            r.next_due_date, r.scheduled_window, r.municipality_id)
    returning id into v_job;

    insert into public.quotes (job_id, pro_id, status, invited_at)
    values (v_job, r.pro_id, 'invited', now());

    insert into public.recurring_occurrences (series_id, due_date, outcome, job_id)
    values (r.id, r.next_due_date, 'created', v_job);

    update public.recurring_bookings
       set last_job_id = v_job,
           occurrences = occurrences + 1,
           next_due_date = public.recurring_advance(frequency, anchor, next_due_date),
           updated_at = now()
     where id = r.id;

    perform public.notify_user_push(r.client_id, 'recurring_created', 'Creamos tu próxima solicitud',
      'Tu profesional ya recibió la solicitud recurrente. Revisa el horario.', '/trabajos/' || v_job, false);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped_cap', v_capped, 'paused', v_paused);
end;
$$;;

create or replace function public.set_recurring_booking_status(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r record;
  v_today date := public.santo_domingo_today();
  v_pro_ok boolean;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;
  select * into r from public.recurring_bookings where id = p_id and client_id = v_uid for update;
  if not found then raise exception 'No encontramos esa serie.'; end if;

  if p_action = 'pause' then
    if r.status <> 'active' then raise exception 'Esta serie no está activa.'; end if;
    update public.recurring_bookings set status = 'paused', paused_reason = null, updated_at = now() where id = p_id;

  elsif p_action = 'resume' then
    if r.status <> 'paused' then raise exception 'Esta serie no está pausada.'; end if;
    select exists (select 1 from public.pros p
                    where p.id = r.pro_id and p.verification_status = 'approved' and not p.is_demo
                      and p.available and p.trade = r.trade)
      into v_pro_ok;
    if exists (select 1 from public.client_suspensions where client_id = v_uid) then
      raise exception 'Tu cuenta está suspendida. No podemos reanudar la serie.';
    end if;
    if not v_pro_ok then raise exception 'Tu profesional no está disponible para este servicio. No podemos reanudar la serie.'; end if;
    update public.recurring_bookings
       set status = 'active',
           paused_reason = null,
           -- A due date in the past is replaced by the next valid date, so a resume never fires late occurrences.
           next_due_date = case when next_due_date > v_today then next_due_date
                                else public.recurring_first_due(frequency, anchor, v_today) end,
           updated_at = now()
     where id = p_id;

  elsif p_action = 'cancel' then
    if r.status not in ('active', 'paused') then raise exception 'Esta serie ya está cancelada.'; end if;
    update public.recurring_bookings set status = 'cancelled', paused_reason = null, updated_at = now() where id = p_id;

  else
    raise exception 'Acción no válida.';
  end if;
end;
$$;;

create or replace function public.create_recurring_booking(p_source_job uuid, p_frequency text, p_anchor integer, p_window text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  j record;
  v_pro_ok boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Debes entrar primero.'; end if;

  select * into j from public.jobs where id = p_source_job and homeowner_id = v_uid;
  if not found then raise exception 'No encontramos ese trabajo.'; end if;
  if j.status <> 'completed' then raise exception 'Solo puedes repetir un trabajo terminado.'; end if;
  if j.pro_id is null then raise exception 'Este trabajo no tiene profesional.'; end if;

  -- The pro is fixed to the source job's pro in v1. The pro must still be approved and not a demo profile.
  select exists (select 1 from public.pros p
                  where p.id = j.pro_id and p.verification_status = 'approved' and not p.is_demo)
    into v_pro_ok;
  if not v_pro_ok then raise exception 'Este profesional ya no atiende solicitudes. Pide una cotización nueva.'; end if;

  if p_frequency not in ('weekly', 'biweekly', 'monthly') then raise exception 'Frecuencia no válida.'; end if;
  if p_frequency in ('weekly', 'biweekly') then
    if p_anchor is null or p_anchor not between 0 and 6 then raise exception 'Elige un día de la semana.'; end if;
  else
    if p_anchor is null or p_anchor not between 1 and 31 then raise exception 'Elige un día del mes entre 1 y 31.'; end if;
  end if;
  if p_window not in ('morning', 'afternoon', 'evening') then raise exception 'Horario no válido.'; end if;

  if exists (select 1 from public.recurring_bookings r
              where r.client_id = v_uid and r.source_job_id = p_source_job and r.status in ('active', 'paused')) then
    raise exception 'Ya tienes una serie recurrente para este trabajo.';
  end if;

  insert into public.recurring_bookings (client_id, pro_id, source_job_id, trade, zone, job_type, description,
                                         frequency, anchor, scheduled_window, next_due_date, municipality_id)
  values (v_uid, j.pro_id, j.id, j.trade, j.zone, j.job_type, btrim(j.description),
          p_frequency, p_anchor, p_window,
          public.recurring_first_due(p_frequency, p_anchor, public.santo_domingo_today()), j.municipality_id)
  returning id into v_id;

  return v_id;
end;
$$;;

