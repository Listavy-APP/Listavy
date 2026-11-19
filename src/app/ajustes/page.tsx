import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PrivacySettings } from "./PrivacySettings";
import { NotificationSettings } from "./NotificationSettings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.settings.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function SettingsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=%2Fajustes");

  // Preferences default ON when no row exists (0091). The verified email gates the email toggle.
  const [{ data: prefRow }, { data: me }] = await Promise.all([
    supabase.from("notification_preferences").select("job_push, job_email").eq("user_id", userData.user.id).maybeSingle(),
    supabase.from("profiles").select("email_verified_at").eq("id", userData.user.id).maybeSingle(),
  ]);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{es.settings.title}</h1>
      <NotificationSettings
        userId={userData.user.id}
        initial={{ job_push: prefRow?.job_push ?? true, job_email: prefRow?.job_email ?? true }}
        emailVerified={!!me?.email_verified_at}
      />
      <PrivacySettings userId={userData.user.id} />
      <Link className="button secondary" href="/cuenta">{es.settings.accountLink}</Link>
      <Link className="settings-quiet-link" href="/cuenta#eliminar">{es.settings.deleteLink}</Link>
    </section>
  );
}
