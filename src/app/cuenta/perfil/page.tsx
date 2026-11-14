import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { ProfileForm } from "../ProfileForm";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.profile.editTitle };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function EditProfilePage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/perfil");
  const profile = await getCurrentProfile(supabase);
  if (!profile) redirect("/cuenta");

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.profile.editTitle}</h1>
      <ProfileForm userId={profile.id} fullName={profile.full_name} zone={profile.zone} />
    </section>
  );
}
