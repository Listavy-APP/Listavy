import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminManager } from "./AdminManager";
import { UrgentFeeForm } from "./UrgentFeeForm";
import { FirstJobSwitch, type FirstJobState } from "./FirstJobSwitch";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Administradores" };
export const instant = false;

export default async function AdminsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin/administradores");
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  if (profile.admin_role !== "super_admin") {
    return (
      <section className="stack">
        <BackBar href="/admin" />
        <h1>No autorizado</h1>
        <p className="muted">Solo un super administrador puede gestionar administradores.</p>
      </section>
    );
  }

  const { data: firstJob } = await supabase.rpc("admin_get_first_job_free");
  const { data: urgentFee } = await supabase.rpc("admin_get_urgent_fee");
  const { data, error } = await supabase.rpc("admin_list_admins");
  const rows = error ? [] : (data ?? []);

  return (
    <section className="stack">
      <BackBar href="/admin" />
      <h1>Administradores</h1>
      {error ? <p role="alert">No se pudo cargar la lista.</p> : null}
      <FirstJobSwitch initial={(firstJob ?? null) as FirstJobState} />
      <UrgentFeeForm initial={typeof urgentFee === "number" ? urgentFee : null} />
      <AdminManager currentUserId={profile.id} admins={rows} />
    </section>
  );
}
