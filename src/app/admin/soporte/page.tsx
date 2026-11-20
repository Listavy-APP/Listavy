import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { adminListTickets } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.support.admin.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function SupportQueuePage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const tickets = await adminListTickets(supabase);

  return (
    <section className="stack">
      <BackBar href="/admin" />
      <h1 className="page-title">{es.support.admin.title}</h1>
      {tickets.length === 0 ? <p className="muted">{es.support.admin.empty}</p> : null}
      {tickets.map((t) => (
        <Link key={t.id} className="panel stack" href={`/admin/soporte/${t.id}`}>
          <strong>{t.subject}</strong>
          <span className="muted">
            {es.support.admin.author}: {t.author_name ?? "—"} · {es.support.categories[t.category]} · {when(t.last_message_at)}
          </span>
          <span className="status-pill">{es.support.statusLabel[t.status]}</span>
        </Link>
      ))}
    </section>
  );
}
