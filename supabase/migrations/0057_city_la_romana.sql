-- Listavy Phase 4: La Romana (third and last launch city).
-- Additive: widens the city check, adds 12 zones to the zone-to-city helper and the zone-by-city checks.
-- No existing rows change. The trigger, search filter, and job request check already read city_of_zone().
-- "Centro" is named "Centro La Romana" here: "Centro" is already a Santiago zone, and zone names must be unique.

-- 1. Allow the fourth city on jobs and pros.
alter table public.jobs drop constraint if exists jobs_city_valid;
alter table public.jobs add constraint jobs_city_valid
  check (city in ('santo_domingo', 'santiago', 'puerto_plata', 'la_romana'));
alter table public.pros drop constraint if exists pros_city_valid;
alter table public.pros add constraint pros_city_valid
  check (city in ('santo_domingo', 'santiago', 'puerto_plata', 'la_romana'));

-- 2. Zone to city, now with La Romana.
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
    when p_zone in ('Centro Histórico', 'El Malecón', 'Ensanche Miramar', 'Padre Granero', 'Barrio Haití',
                    'Gregorio Luperón', 'El Javillar', 'Los Callejones', 'Playa Oeste', 'San Marcos',
                    'Villa Progreso', 'Costambar')
      then 'puerto_plata'
    when p_zone in ('Centro La Romana', 'Villa Verde', 'Villa España', 'Quisqueya', 'San Carlos', 'Savica',
                    'Bancola', 'Buena Vista Norte', 'Villa Nazaret', 'Don Juan', 'Caleta', 'Villa Hermosa')
      then 'la_romana'
    else null
  end;
$$;

-- 3. Zone must belong to the city, for all four cities.
alter table public.pros drop constraint if exists pros_zone_by_city;
alter table public.pros add constraint pros_zone_by_city check (
  (city = 'santo_domingo' and zone in ('Piantini', 'Naco', 'Bella Vista', 'Gazcue', 'Serrallés', 'Ciudad Colonial',
     'Los Cacicazgos', 'Evaristo Morales', 'Mirador Norte', 'Mirador Sur', 'Villa Juana', 'Los Prados',
     'Arroyo Hondo', 'Ensanche Ozama', 'Los Mina'))
  or
  (city = 'santiago' and zone in ('Centro', 'Pueblo Nuevo', 'Los Pepines', 'Gurabito', 'Villa Olga', 'La Trinitaria',
     'Cerros de Gurabo', 'Gurabo', 'Llanos de Gurabo', 'La Esmeralda', 'Jardines Metropolitanos', 'Thomen',
     'Villa María', 'La Salle', 'Ensanche Libertad'))
  or
  (city = 'puerto_plata' and zone in ('Centro Histórico', 'El Malecón', 'Ensanche Miramar', 'Padre Granero',
     'Barrio Haití', 'Gregorio Luperón', 'El Javillar', 'Los Callejones', 'Playa Oeste', 'San Marcos',
     'Villa Progreso', 'Costambar'))
  or
  (city = 'la_romana' and zone in ('Centro La Romana', 'Villa Verde', 'Villa España', 'Quisqueya', 'San Carlos',
     'Savica', 'Bancola', 'Buena Vista Norte', 'Villa Nazaret', 'Don Juan', 'Caleta', 'Villa Hermosa'))
);

alter table public.jobs drop constraint if exists jobs_zone_by_city;
alter table public.jobs add constraint jobs_zone_by_city check (
  (city = 'santo_domingo' and zone in ('Piantini', 'Naco', 'Bella Vista', 'Gazcue', 'Serrallés', 'Ciudad Colonial',
     'Los Cacicazgos', 'Evaristo Morales', 'Mirador Norte', 'Mirador Sur', 'Villa Juana', 'Los Prados',
     'Arroyo Hondo', 'Ensanche Ozama', 'Los Mina'))
  or
  (city = 'santiago' and zone in ('Centro', 'Pueblo Nuevo', 'Los Pepines', 'Gurabito', 'Villa Olga', 'La Trinitaria',
     'Cerros de Gurabo', 'Gurabo', 'Llanos de Gurabo', 'La Esmeralda', 'Jardines Metropolitanos', 'Thomen',
     'Villa María', 'La Salle', 'Ensanche Libertad'))
  or
  (city = 'puerto_plata' and zone in ('Centro Histórico', 'El Malecón', 'Ensanche Miramar', 'Padre Granero',
     'Barrio Haití', 'Gregorio Luperón', 'El Javillar', 'Los Callejones', 'Playa Oeste', 'San Marcos',
     'Villa Progreso', 'Costambar'))
  or
  (city = 'la_romana' and zone in ('Centro La Romana', 'Villa Verde', 'Villa España', 'Quisqueya', 'San Carlos',
     'Savica', 'Bancola', 'Buena Vista Norte', 'Villa Nazaret', 'Don Juan', 'Caleta', 'Villa Hermosa'))
);
