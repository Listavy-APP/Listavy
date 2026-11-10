import type { Trade } from "@/lib/types/database";

/** Trades offered in v1. Must match the check constraints in the migrations. */
export const TRADES: readonly Trade[] = ["plumber", "electrician", "ac_technician"] as const;

/**
 * Santo Domingo zones for v1. Must match pros_zone_valid in migration 0003.
 * PROVISIONAL: confirm the list with the ground verifier before launch.
 */
export const SD_ZONES = [
  "Piantini", "Naco", "Bella Vista", "Gazcue", "Serrallés", "Ciudad Colonial",
  "Los Cacicazgos", "Evaristo Morales", "Mirador Norte", "Mirador Sur",
  "Villa Juana", "Los Prados", "Arroyo Hondo", "Ensanche Ozama", "Los Mina",
] as const;

export type Zone = (typeof SD_ZONES)[number];

export function isTrade(value: string): value is Trade {
  return (TRADES as readonly string[]).includes(value);
}

export function isZone(value: string): value is Zone {
  return (SD_ZONES as readonly string[]).includes(value);
}
