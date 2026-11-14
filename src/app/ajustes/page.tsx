import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PrivacySettings } from "./PrivacySettings";
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

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{es.settings.title}</h1>
      <PrivacySettings userId={userData.user.id} />
      <Link className="button secondary" href="/cuenta">{es.settings.accountLink}</Link>
    </section>
  );
}
