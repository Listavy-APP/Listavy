import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_DOCS, type LegalDocId } from "@/lib/legal";

/**
 * Records that the signed-in user accepted each document at its current version.
 * Writes go through record_legal_acceptance (migration 0073), which stamps the user from auth.uid().
 * Throws if any row fails, so the caller can stop the step that needs the acceptance.
 */
export async function recordLegalAcceptance(supabase: SupabaseClient, ids: LegalDocId[]): Promise<void> {
  for (const id of ids) {
    const { error } = await supabase.rpc("record_legal_acceptance", {
      p_document: id,
      p_version: LEGAL_DOCS[id].version,
    });
    if (error) throw new Error(`No se pudo registrar la aceptación: ${error.message}`);
  }
}
