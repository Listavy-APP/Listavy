import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { ThreadReply } from "./ThreadReply";
import { getMyTicket } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/domain/uuid";

export const metadata = { title: es.support.thread };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/login?next=/ayuda/tickets/${id}`);

  const found = await getMyTicket(supabase, id);
  if (!found) notFound();
  const { ticket, messages } = found;

  return (
    <section className="stack">
      <BackBar href="/ayuda/tickets" />
      <h1 className="page-title">{ticket.subject}</h1>
      <p className="muted">
        {es.support.categories[ticket.category]} · <span className="status-pill">{es.support.statusLabel[ticket.status]}</span>
      </p>
      <h2>{es.support.thread}</h2>
      <ol className="stack" style={{ listStyle: "none", padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} className="panel stack">
            <span className="muted">
              {m.from_admin ? es.support.team : es.support.you} · {when(m.created_at)}
            </span>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p>
          </li>
        ))}
      </ol>
      {ticket.status === "closed" ? (
        <p className="notice">{es.support.closedNotice}</p>
      ) : (
        <ThreadReply ticketId={ticket.id} />
      )}
    </section>
  );
}
