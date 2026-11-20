import type { SupabaseClient } from "@supabase/supabase-js";
import { verifiedIconKind, type VerifiedKind } from "@/lib/domain/verifiedIcon";

/**
 * Icon kind for each pro in one call (pro_verified_flags, 0102). Pros with no icon are absent from the map.
 * A failed read returns an empty map: no icon, never an error on the screen.
 */
export async function verifiedKindsByPro(
  supabase: SupabaseClient,
  pros: { id: string; isCompany: boolean }[],
): Promise<Map<string, VerifiedKind>> {
  const out = new Map<string, VerifiedKind>();
  if (pros.length === 0) return out;
  const { data, error } = await supabase.rpc("pro_verified_flags", { p_pro_ids: pros.map((p) => p.id) });
  if (error) return out;
  const stagesById = new Map(((data ?? []) as { pro_id: string; stages: string[] }[]).map((r) => [r.pro_id, r.stages]));
  for (const p of pros) {
    const kind = verifiedIconKind(stagesById.get(p.id) ?? [], p.isCompany);
    if (kind) out.set(p.id, kind);
  }
  return out;
}
