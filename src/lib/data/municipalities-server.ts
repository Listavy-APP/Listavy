import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMunicipalities, type Municipality } from "@/lib/data/municipalities";

/** Per-request cache. Pages and forms that render pickers share one read. */
export const getMunicipalities = cache(async (): Promise<Municipality[]> => {
  const supabase = await createSupabaseServerClient();
  return listMunicipalities(supabase);
});
