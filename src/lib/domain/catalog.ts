import type { Trade } from "@/lib/types/database";

/** Trades offered in v1. Must match the check constraints in the migrations. */
export const TRADES: readonly Trade[] = [
  "plumber",
  "electrician",
  "ac_technician",
  "painter",
  "locksmith",
  "carpenter",
  "blacksmith",
] as const;

/** Cities. Must match the city check constraints in migrations 0054. */
export const CITIES = ["santo_domingo", "santiago"] as const;
export type City = (typeof CITIES)[number];
export const DEFAULT_CITY: City = "santo_domingo";

/**
 * Santo Domingo zones for v1. Must match pros_zone_by_city in migration 0054.
 * PROVISIONAL: confirm the list with the ground verifier before launch.
 */
export const SD_ZONES = [
  "Piantini", "Naco", "Bella Vista", "Gazcue", "Serrallés", "Ciudad Colonial",
  "Los Cacicazgos", "Evaristo Morales", "Mirador Norte", "Mirador Sur",
  "Villa Juana", "Los Prados", "Arroyo Hondo", "Ensanche Ozama", "Los Mina",
] as const;

/**
 * Santiago de los Caballeros zones, confirmed by Fabian (2026-11-14). Use in this order.
 * Must match the Santiago branch of pros_zone_by_city in migration 0054.
 */
export const SANTIAGO_ZONES = [
  "Centro", "Pueblo Nuevo", "Los Pepines", "Gurabito", "Villa Olga", "La Trinitaria",
  "Cerros de Gurabo", "Gurabo", "Llanos de Gurabo", "La Esmeralda",
  "Jardines Metropolitanos", "Thomen", "Villa María", "La Salle", "Ensanche Libertad",
] as const;

export const ZONES_BY_CITY: Record<City, readonly string[]> = {
  santo_domingo: SD_ZONES,
  santiago: SANTIAGO_ZONES,
};

export type Zone = (typeof SD_ZONES)[number] | (typeof SANTIAGO_ZONES)[number];

export function isTrade(value: string): value is Trade {
  return (TRADES as readonly string[]).includes(value);
}

export function isCity(value: string): value is City {
  return (CITIES as readonly string[]).includes(value);
}

export function isZone(value: string): value is Zone {
  return cityOfZone(value) !== null;
}

/** The city a zone belongs to, or null for an unknown zone. */
export function cityOfZone(value: string): City | null {
  if ((SD_ZONES as readonly string[]).includes(value)) return "santo_domingo";
  if ((SANTIAGO_ZONES as readonly string[]).includes(value)) return "santiago";
  return null;
}
