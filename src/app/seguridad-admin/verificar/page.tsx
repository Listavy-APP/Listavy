import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminTotpVerify } from "../AdminTotpVerify";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Verificación de administrador" };
export const instant = false;

export default async function VerifyPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin");
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) redirect("/seguridad-admin/enrolar");
  return <AdminTotpVerify factorId={factor.id} />;
}
