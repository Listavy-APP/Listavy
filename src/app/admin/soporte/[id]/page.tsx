import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { AdminTicketActions } from "./AdminTicketActions";
import { getCurrentProfile } from "@/lib/data/profiles";
import { adminListMessages, adminListTickets } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.support.admin.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function SupportTicketAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const ticket = (await adminListTickets(supabase)).find((t) => t.id === id);
  if (!ticket) notFound();
  const messages = await adminListMessages(supabase, id);

  return (
    <section className="stack">
      <BackBar href="/admin/soporte" />
      <h1 className="page-title">{ticket.subject}</h1>
      <p className="muted">
        {es.support.admin.author}: {ticket.author_name ?? "—"} · {es.support.categories[ticket.category]} ·{" "}
        <span className="status-pill">{es.support.statusLabel[ticket.status]}</span>
      </p>
      <h2>{es.support.thread}</h2>
      <ol className="stack" style={{ listStyle: "none", padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} className="panel stack">
            <span className="muted">
              {m.from_admin ? es.support.team : ticket.author_name ?? es.support.admin.author} · {when(m.created_at)}
            </span>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p>
          </li>
        ))}
      </ol>
      <AdminTicketActions ticketId={id} status={ticket.status} />
    </section>
  );
}
