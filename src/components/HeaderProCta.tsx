import Link from "next/link";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** "Únete como profesional" for visitors. Hidden for signed-in pros. */
export async function HeaderProCta() {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (profile?.role === "pro") return null;
  return <Link className="link-quiet" href="/pro/registro">{es.discover.proCtaButton}</Link>;
}
