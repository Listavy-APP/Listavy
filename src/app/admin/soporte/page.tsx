import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getCurrentProfile } from "@/lib/data/profiles";
import { adminListTickets, SUPPORT_QUEUE_PAGE_SIZE } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.support.admin.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function SupportQueuePage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await connection();
  const { pagina = "1" } = await searchParams;
  const page = /^\d+$/.test(pagina) && Number(pagina) >= 1 ? Number(pagina) : 1;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const tickets = await adminListTickets(supabase, (page - 1) * SUPPORT_QUEUE_PAGE_SIZE);
  // The definer returns at most one full page. A full page means there may be more.
  const hasNext = tickets.length === SUPPORT_QUEUE_PAGE_SIZE;

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
      {page > 1 || hasNext ? (
        <nav className="row" aria-label={es.support.admin.pageLabel}>
          {page > 1 ? (
            <Link className="button secondary" href={page - 1 === 1 ? "/admin/soporte" : `/admin/soporte?pagina=${page - 1}`} style={{ minHeight: 44 }}>
              {es.support.admin.prevPage}
            </Link>
          ) : null}
          {hasNext ? (
            <Link className="button secondary" href={`/admin/soporte?pagina=${page + 1}`} style={{ minHeight: 44 }}>
              {es.support.admin.nextPage}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
