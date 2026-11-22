import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { listAllFixedServices } from "@/lib/data/fixed";
import { listTrades } from "@/lib/data/trades";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FixedServiceForm } from "./FixedServiceForm";

export const metadata = { title: es.fixed.admin.title };
export const instant = false;

/** Fixed-price catalog (0116). Super administrators only. The catalog ships empty. */
export default async function FixedServicesAdminPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin/servicios-fijos");
  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();
  if (profile.admin_role !== "super_admin") {
    return (
      <section className="stack">
        <BackBar href="/admin" />
        <h1>{es.fixed.admin.title}</h1>
        <p className="muted">Solo un super administrador puede editar el catálogo.</p>
      </section>
    );
  }

  const [services, trades] = await Promise.all([listAllFixedServices(supabase), listTrades(supabase)]);

  return (
    <section className="stack">
      <BackBar href="/admin" />
      <h1>{es.fixed.admin.title}</h1>
      <p className="muted">{es.fixed.admin.intro}</p>
      {services.length === 0 ? <p className="muted">{es.fixed.admin.empty}</p> : null}
      <ul className="list">
        {services.map((s) => (
          <li key={s.id}>
            <b>{s.name_es}</b> · {es.money.dop(s.price_dop)} · {s.active ? "" : `${es.fixed.admin.inactive} · `}
            <span className="muted">{s.includes_es}</span>
            <FixedServiceForm trades={trades} existing={s} />
          </li>
        ))}
      </ul>
      <h2>{es.fixed.admin.newService}</h2>
      <FixedServiceForm trades={trades} existing={null} />
    </section>
  );
}
