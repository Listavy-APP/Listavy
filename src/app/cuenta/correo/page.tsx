import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { EmailForm } from "../EmailForm";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.profile.emailLabel };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function EmailEditPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/correo");
  const profile = await getCurrentProfile(supabase);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.profile.emailLabel}</h1>
      <EmailForm current={profile?.email ?? null} verified={profile?.email_verified_at != null} />
    </section>
  );
}
