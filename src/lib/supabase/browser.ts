import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Client Components. Uses the anon key plus the user's session. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
