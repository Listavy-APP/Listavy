import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listTemplates } from "@/lib/data/pro-tools";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplatesManager } from "./TemplatesManager";

export const metadata = { title: es.proTemplates.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

/** Owner-only quote templates for the signed-in pro (0093). Applying one happens in the quote form. */
export default async function ProTemplatesPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/pro/plantillas");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "pro") redirect("/cuenta");

  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let loadFailed = false;
  try {
    templates = await listTemplates(supabase);
  } catch {
    loadFailed = true;
  }

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.proTemplates.title}</h1>
      <p className="muted">{es.proTemplates.intro}</p>
      {loadFailed ? <p className="error" role="alert">{es.proTemplates.loadFailed}</p> : null}
      <TemplatesManager initial={templates} proId={profile.id} />
    </section>
  );
}
