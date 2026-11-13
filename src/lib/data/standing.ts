import type { SupabaseClient } from "@supabase/supabase-js";

/** The signed-in client's standing from private ratings (migration 0032). Counts only. */

export interface ClientStanding {
  low_count: number;
  warning: boolean;
  blocked: boolean;
}

export async function getClientStanding(supabase: SupabaseClient): Promise<ClientStanding> {
  const { data, error } = await supabase.rpc("client_standing");
  if (error) throw new Error(`No se pudo leer tu situación: ${error.message}`);
  const row = (data ?? [])[0] as ClientStanding | undefined;
  return row ?? { low_count: 0, warning: false, blocked: false };
}
