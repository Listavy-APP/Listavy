import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { EmptyState } from "@/components/EmptyState";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.proPayouts.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

type PayoutRow = {
  id: string;
  status: string;
  pro_payout_dop: number | null;
  released_at: string | null;
  created_at: string;
  jobs: { trade: string; zone: string; pro_id: string } | { trade: string; zone: string; pro_id: string }[] | null;
};

const STATUS_LABEL: Record<string, string> = {
  released: es.proPayouts.released,
  held: es.proPayouts.held,
  disputed: es.proPayouts.disputed,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo", day: "numeric", month: "short", year: "numeric" });
}

/**
 * Read-only payout history for the signed-in pro (UI phase §7, item 5).
 * Shows only payments for jobs where this pro is the assigned pro. No balance, no money actions.
 */
export default async function ProPayoutsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/pro/pagos");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "pro") redirect("/cuenta");

  const { data, error } = await supabase
    .from("payments")
    .select("id, status, pro_payout_dop, released_at, created_at, jobs!inner(trade, zone, pro_id)")
    .eq("purpose", "job")
    .eq("jobs.pro_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Joined rows come back as objects at runtime; the generated types read them as arrays.
  const rows = ((data ?? []) as unknown as PayoutRow[]).map((r) => ({
    ...r,
    job: Array.isArray(r.jobs) ? r.jobs[0] : r.jobs,
  }));

  return (
    <section className="stack">
      <BackBar href="/pro/estado" />
      <h1 className="page-title">{es.proPayouts.title}</h1>
      <p className="muted">{es.proPayouts.note}</p>
      {error ? <p className="error">{es.proPayouts.failed}</p> : null}
      {!error && rows.length === 0 ? (
        <EmptyState title={es.proPayouts.title} body={es.proPayouts.empty} />
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="job-card">
              <div className="job-card-top">
                <strong>{r.job ? es.trades[r.job.trade as keyof typeof es.trades] ?? r.job.trade : "—"}</strong>
                <span className="status-pill">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <div className="muted">
                {r.job?.zone ?? "—"} · {formatDate(r.released_at ?? r.created_at)}
              </div>
              {r.pro_payout_dop !== null ? (
                <div className="job-card-amount">RD${r.pro_payout_dop.toLocaleString("es-DO")}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
