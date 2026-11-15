import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminNav } from "./AdminNav";
import { AuditLog } from "./AuditLog";
import { CheckinProblems } from "./CheckinProblems";
import { AdminBell } from "./AdminBell";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: "Resumen de administración" };

// Session-dependent page: read at request time, never cached.
export const instant = false;

function dop(amount: number): string {
  return `RD$${amount.toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
}

function dateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-DO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santo_Domingo",
  });
}

function tally<T>(rows: T[] | null, key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </>
  );
  return href ? (
    <Link className="stat" href={href}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

export default async function AdminDashboardPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const nowIso = new Date().toISOString();
  const [
    pendingPros,
    jobs,
    openDisputes,
    payments,
    hiddenReviews,
    openReports,
    activeBoosts,
    referrals,
  ] = await Promise.all([
    supabase.from("pros").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    supabase.from("jobs").select("status"),
    supabase
      .from("disputes")
      .select("id, job_id, stage, evidence_due_at")
      .neq("stage", "closed")
      .order("evidence_due_at", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase.from("payments").select("status, pro_payout_dop, keep_pro_payout_dop, released_at, release_after"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    supabase.rpc("count_open_pro_reports"),
    supabase.from("boosts").select("id", { count: "exact", head: true }).eq("status", "active").gt("ends_at", nowIso),
    supabase.from("referrals").select("status"),
  ]);

  const jobCounts = tally(jobs.data as { status: string }[] | null, (r) => r.status);
  const jobTotal = (jobs.data ?? []).length;

  const paymentRows = (payments.data ?? []) as {
    status: string;
    pro_payout_dop: number | null;
    keep_pro_payout_dop: number | null;
    released_at: string | null;
    release_after: string | null;
  }[];
  const held = paymentRows.filter((p) => p.status === "held");
  const released = paymentRows.filter((p) => p.status === "released");
  const payoutOf = (p: { pro_payout_dop: number | null; keep_pro_payout_dop: number | null }) =>
    p.keep_pro_payout_dop ?? p.pro_payout_dop ?? 0;
  const heldSum = held.reduce((a, p) => a + payoutOf(p), 0);
  const releasedSum = released.reduce((a, p) => a + payoutOf(p), 0);
  const dueNow = held.filter((p) => p.release_after && p.release_after <= nowIso).length;

  const refCounts = tally(referrals.data as { status: string }[] | null, (r) => r.status);

  const disputes = (openDisputes.data ?? []) as {
    id: string;
    job_id: string;
    stage: string;
    evidence_due_at: string | null;
  }[];

  return (
    <section className="stack">
      <AdminNav current="/admin" />
      <BackBar href="/" />
      <div className="admin-head">
        <h1>Resumen de administración</h1>
        <AdminBell />
      </div>
      <p className="muted">Solo lectura. Cada sección abre su propia pantalla para actuar.</p>

      <h2>Profesionales</h2>
      <Stat label="Pendientes de aprobación" value={pendingPros.count ?? 0} />

      <h2>Trabajos por estado</h2>
      <Stat label="Total de trabajos" value={jobTotal} />
      {Object.keys(jobCounts).length === 0 ? (
        <p className="muted">Sin trabajos.</p>
      ) : (
        Object.entries(jobCounts).map(([status, n]) => <Stat key={status} label={status} value={n} />)
      )}

      <h2>Disputas abiertas</h2>
      <Stat label="Abiertas" value={disputes.length} href="/admin/disputas" />
      {disputes.slice(0, 5).map((d) => (
        <p key={d.id} className="muted">
          Trabajo {d.job_id.slice(0, 8)}… · etapa {d.stage} · plazo de evidencia {dateTime(d.evidence_due_at)}
        </p>
      ))}

      <h2>Pagos</h2>
      <Stat label="Retenidos" value={`${held.length} · ${dop(heldSum)}`} href="/admin/pagos" />
      <Stat label="Vencidos para liberar" value={dueNow} href="/admin/pagos" />
      <Stat label="Liberados" value={`${released.length} · ${dop(releasedSum)}`} href="/admin/pagos" />

      <h2>Reseñas</h2>
      <Stat label="Ocultas para revisión" value={hiddenReviews.count ?? 0} href="/admin/resenas" />

      <h2>Reportes de profesionales</h2>
      <Stat label="Sin resolver" value={Number(openReports.data ?? 0)} href="/admin/pagos" />

      <h2>Destacados</h2>
      <Stat label="Promociones activas" value={activeBoosts.count ?? 0} href="/admin/destacados" />

      <h2>Referidos</h2>
      {Object.keys(refCounts).length === 0 ? (
        <p className="muted">Sin referidos.</p>
      ) : (
        Object.entries(refCounts).map(([status, n]) => (
          <Stat key={status} label={status} value={n} href="/admin/referidos" />
        ))
      )}
      <AuditLog />
      <CheckinProblems />
    </section>
  );
}
