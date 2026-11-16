import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminBell } from "./AdminBell";
import { AdminShell, type AdminBadges } from "./AdminShell";

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

  // Badge counts for the sidebar. The bell summary is the same RPC the bell uses; photo reports are
  // counted directly (admin RLS). A failed read shows no badge rather than breaking the shell.
  const [summaryRes, photoRes, verificationRes] = await Promise.all([
    supabase.rpc("admin_notification_summary"),
    supabase.from("job_photo_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("pro_verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const summary = ((summaryRes.data ?? []) as {
    open_disputes: number;
    reviews_awaiting_moderation: number;
    pending_pro_applications: number;
  }[])[0];
  const badges: AdminBadges = {
    pendientes: summary?.pending_pro_applications ?? 0,
    disputas: summary?.open_disputes ?? 0,
    resenas: summary?.reviews_awaiting_moderation ?? 0,
    fotos: photoRes.count ?? 0,
    verificaciones: verificationRes.count ?? 0,
  };

  return (
    <AdminShell
      badges={badges}
      isSuper={profile.admin_role === "super_admin"}
      userName={profile.full_name ?? "Administrador"}
      bell={<AdminBell />}
    >
      {children}
    </AdminShell>
  );
}
