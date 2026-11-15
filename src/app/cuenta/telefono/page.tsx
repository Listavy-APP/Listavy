import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { PhoneChangeForm } from "./PhoneChangeForm";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.phoneChange.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function PhoneChangePage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/telefono");
  const profile = await getCurrentProfile(supabase);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.phoneChange.title}</h1>
      <p className="muted">{es.phoneChange.hint}</p>
      <PhoneChangeForm initialPhone={profile?.phone ?? null} />
    </section>
  );
}
