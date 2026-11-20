import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { esViewAs } from "@/lib/i18n/view-as";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Preview pages are never indexed and never linked from public pages.
export const metadata = { title: "Vista de administrador", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Preview shell: TOTP session check, then the banner on every preview screen.
 * The gate itself is in the database (admin_view_as_profile): a non-super-admin gets 42501 and a 404 here.
 * Route group (ver-como) keeps this out of the admin shell, so the preview looks like the user's app.
 */
export default async function ViewAsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  await connection();
  if (!UUID.test(userId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/seguridad-admin/verificar");

  const { data, error } = await supabase.rpc("admin_view_as_profile", { p_target: userId });
  if (error) {
    if (error.code === "42501" || error.code === "P0002") notFound();
    throw new Error(`No se pudo abrir la vista: ${error.message}`);
  }
  const target = ((data ?? []) as { full_name: string | null }[])[0];
  if (!target) notFound();

  // Bitácora: one entry per session per target, whatever the entry path. Repeat renders add nothing.
  const { error: enterError } = await supabase.rpc("admin_view_as_enter", { p_target: userId });
  if (enterError) throw new Error(`No se pudo registrar la vista: ${enterError.message}`);

  return (
    <div className="view-as">
      <header className="view-as-banner" aria-label={esViewAs.bannerLabel}>
        <p className="view-as-text"><strong>{esViewAs.banner(target.full_name ?? "—")}</strong></p>
        <Link className="button secondary view-as-exit" href="/admin/clientes">{esViewAs.exit}</Link>
      </header>
      {children}
    </div>
  );
}
