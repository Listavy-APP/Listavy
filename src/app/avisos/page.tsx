import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { listMyNotifications } from "@/lib/data/disputes";
import { listMyCheckins } from "@/lib/data/jobNotifications";
import { CheckinCard } from "./CheckinCard";
import { EmptyState } from "@/components/EmptyState";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.notifications.title };

// Session-dependent page: read at request time, never cached.
export const instant = false;

const TZ = "America/Santo_Domingo";

/** "vence hoy 5:47 p. m." / "vence mañana …" / "vence 16 nov 5:47 p. m." in Santo Domingo time. */
function disputeDeadline(due: Date, now: Date): string {
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const time = due.toLocaleTimeString("es-DO", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dayKey(due) === dayKey(now)) return `${es.notifications.dueToday} ${time}`;
  if (dayKey(due) === dayKey(tomorrow)) return `${es.notifications.dueTomorrow} ${time}`;
  const date = due.toLocaleDateString("es-DO", { timeZone: TZ, day: "numeric", month: "short" });
  return `${es.notifications.dueOn} ${date} ${time}`;
}

export default async function NotificationsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const rows = await listMyNotifications(supabase);
  const checkins = await listMyCheckins(supabase);
  // Disputes whose evidence window is still open (same rule as DisputePanel). RLS: job parties and admins.
  const { data: disputeRows } = await supabase
    .from("disputes")
    .select("id, job_id, evidence_due_at, job:jobs(trade, zone, approved_quote:quotes!jobs_approved_quote_id_fkey(amount_dop))")
    .eq("stage", "evidence")
    .order("evidence_due_at", { ascending: true });
  const now = new Date();
  // To-one joins come back as objects at runtime; the generated types read them as arrays.
  type DisputeCard = {
    id: string;
    job_id: string;
    evidence_due_at: string | null;
    job: { trade: string; zone: string; approved_quote: { amount_dop: number } | null } | null;
  };
  const disputes = ((disputeRows ?? []) as unknown as DisputeCard[]).filter(
    (d) => d.evidence_due_at && new Date(d.evidence_due_at) > now,
  );

  return (
    <section className="stack">
      <h1>{es.notifications.title}</h1>
      {disputes.length > 0 ? (
        <div className="stack">
          <h2>{es.notifications.openDisputes}</h2>
          {disputes.map((d) => (
            <article key={d.id} className="card stack">
              <p className="muted">{es.notifications.disputeOpen}</p>
              <p>
                <strong>{es.trades[d.job?.trade as keyof typeof es.trades] ?? d.job?.trade}</strong>
                {d.job?.approved_quote ? ` · RD$${d.job.approved_quote.amount_dop.toLocaleString("es-DO")}` : ""}
              </p>
              <p className="muted">{disputeDeadline(new Date(d.evidence_due_at as string), now)}</p>
              <Link className="button secondary" href={`/trabajos/${d.job_id}`}>
                {es.notifications.disputeAction}
              </Link>
            </article>
          ))}
        </div>
      ) : null}
      {checkins.length > 0 ? (
        <div className="stack">
          <h2>{es.checkins.title}</h2>
          {checkins.map((c) => (
            <CheckinCard key={c.id} checkin={c} />
          ))}
        </div>
      ) : null}
      {rows.length === 0 && checkins.length === 0 ? (
        <EmptyState title={es.notifications.empty} body={es.notifications.emptyBody} actionHref="/buscar" actionLabel={es.search.title} />
      ) : null}
      {rows.map((n) => (
        <article key={n.id} className="card stack">
          <p className="muted">
            {es.notifications.kinds[n.kind]} ·{" "}
            {new Date(n.created_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" })}
          </p>
          <p>{n.body}</p>
          {n.job_id ? (
            <Link className="button secondary" href={`/trabajos/${n.job_id}`}>
              {es.notifications.disputeAction}
            </Link>
          ) : null}
        </article>
      ))}
    </section>
  );
}
