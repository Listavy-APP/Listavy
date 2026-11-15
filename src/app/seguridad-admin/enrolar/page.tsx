import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminTotpEnroll } from "../AdminTotp";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Activar verificación de administrador" };
export const instant = false;

export default async function EnrollPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin");
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/admin");
  return <AdminTotpEnroll />;
}
