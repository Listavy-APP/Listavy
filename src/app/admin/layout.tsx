import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Every /admin page passes through here. Admins must hold a TOTP-verified session (AAL2).
 * Without a verified TOTP factor: enroll. With one: verify. Non-admins get a 404, as before.
 * The enrollment and verification pages live outside /admin to avoid a redirect loop.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
    redirect(hasTotp ? "/seguridad-admin/verificar" : "/seguridad-admin/enrolar");
  }

  return <>{children}</>;
}
