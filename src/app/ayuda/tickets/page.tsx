import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { listMyTickets } from "@/lib/data/support";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.support.myTickets };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

function when(iso: string): string {
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function MyTicketsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/ayuda/tickets");

  const tickets = await listMyTickets(supabase);

  return (
    <section className="stack">
      <BackBar href="/ayuda" />
      <h1 className="page-title">{es.support.myTickets}</h1>
      <Link className="button" href="/ayuda/tickets/nuevo">
        {es.support.newTicket}
      </Link>
      {tickets.length === 0 ? <p className="muted">{es.support.noTickets}</p> : null}
      {tickets.map((t) => (
        <Link key={t.id} className="panel stack" href={`/ayuda/tickets/${t.id}`}>
          <strong>{t.subject}</strong>
          <span className="muted">
            {es.support.categories[t.category]} · {when(t.last_message_at)}
          </span>
          <span className="status-pill">{es.support.statusLabel[t.status]}</span>
        </Link>
      ))}
    </section>
  );
}
