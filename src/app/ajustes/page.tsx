import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PrivacySettings } from "./PrivacySettings";
import { NotificationSettings } from "./NotificationSettings";
import { DeleteAccount } from "./DeleteAccount";
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
  const [{ data: prefRow }, { data: me }, { data: waOn }] = await Promise.all([
    supabase.from("notification_preferences").select("job_push, job_email, job_whatsapp").eq("user_id", userData.user.id).maybeSingle(),
    supabase.from("profiles").select("email_verified_at").eq("id", userData.user.id).maybeSingle(),
    // The WhatsApp toggle ships only after the channel is proven (0118 ui_enabled). Hidden until then.
    supabase.rpc("job_whatsapp_available"),
  ]);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{es.settings.title}</h1>
      <NotificationSettings
        userId={userData.user.id}
        initial={{
          job_push: prefRow?.job_push ?? true,
          job_email: prefRow?.job_email ?? true,
          job_whatsapp: prefRow?.job_whatsapp ?? true,
        }}
        emailVerified={!!me?.email_verified_at}
        whatsappAvailable={waOn === true}
      />
      <PrivacySettings userId={userData.user.id} />
      <div className="delete-entry-block">
        <h3 className="delete-entry-title">{es.profile.deleteTitle}</h3>
        <DeleteAccount />
      </div>
    </section>
  );
}
