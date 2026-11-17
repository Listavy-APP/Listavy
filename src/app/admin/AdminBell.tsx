import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Summary = {
  open_disputes: number;
  open_pro_reports: number;
  reviews_awaiting_moderation: number;
  unresolved_job_flags: number;
  pending_pro_applications: number;
  total: number;
  severity: "urgent" | "attention" | "clear";
};

const LIMIT = 20;

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

/** Admin-only bell. Counts are unresolved rows, so the badge clears when items are resolved. */
export async function AdminBell() {
  const supabase = await createSupabaseServerClient();
  const { data: sumRows, error: sumErr } = await supabase.rpc("admin_notification_summary");
  if (sumErr) throw new Error(`No se pudo leer el resumen: ${sumErr.message}`);
  const s = ((sumRows ?? []) as Summary[])[0];
  if (!s) return null;

  const [disputes, reports, reviews, flags, pros] = await Promise.all([
    s.open_disputes > 0
      ? supabase.from("disputes").select("id, opened_at, phase").eq("status", "open").order("opened_at", { ascending: false }).limit(LIMIT)
      : Promise.resolve({ data: [] }),
    s.open_pro_reports > 0
      ? supabase.rpc("list_pro_reports")
      : Promise.resolve({ data: [] }),
    s.reviews_awaiting_moderation > 0
      ? supabase.from("reviews").select("id, rating, created_at").eq("status", "hidden").order("created_at", { ascending: false }).limit(LIMIT)
      : Promise.resolve({ data: [] }),
    s.unresolved_job_flags > 0
      ? supabase.rpc("admin_list_checkin_problems")
      : Promise.resolve({ data: [] }),
    s.pending_pro_applications > 0
      ? supabase.from("pros").select("id, created_at").eq("verification_status", "pending").is("closed_at", null).order("created_at", { ascending: false }).limit(LIMIT)
      : Promise.resolve({ data: [] }),
  ]);

  const openReports = ((reports.data ?? []) as { id: string; reason: string; created_at: string; resolved_at: string | null }[])
    .filter((r) => r.resolved_at === null)
    .slice(0, LIMIT);

  const badgeClass = s.severity === "urgent" ? "bell-badge urgent" : "bell-badge attention";

  return (
    <details className="admin-bell">
      <summary className="bell" aria-label={`Notificaciones: ${s.total} pendientes`}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {s.total > 0 ? <span className={badgeClass}>{s.total}</span> : null}
      </summary>

      <div className="panel stack bell-panel">
        {s.total === 0 ? <p className="muted">No hay pendientes.</p> : null}

        {s.open_disputes > 0 ? (
          <section className="stack">
            <b>Disputas abiertas ({s.open_disputes})</b>
            {((disputes.data ?? []) as { id: string; opened_at: string; phase: string }[]).map((d) => (
              <Link key={d.id} className="bell-row" href="/admin/disputas">
                <span>Disputa {d.phase === "pre_release" ? "antes de liberar" : "después de liberar"}</span>
                <span className="muted">{when(d.opened_at)}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {s.open_pro_reports > 0 ? (
          <section className="stack">
            <b>Reportes de profesionales ({s.open_pro_reports})</b>
            {openReports.map((r) => (
              <Link key={r.id} className="bell-row" href="/admin/pagos">
                <span>Reporte: {r.reason}</span>
                <span className="muted">{when(r.created_at)}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {s.unresolved_job_flags > 0 ? (
          <section className="stack">
            <b>Problemas reportados en trabajos ({s.unresolved_job_flags})</b>
            {((flags.data ?? []) as { id: string; kind: string; problem_reported_at: string }[]).slice(0, LIMIT).map((f) => (
              <Link key={f.id} className="bell-row" href="/admin">
                <span>Problema en trabajo ({f.kind})</span>
                <span className="muted">{when(f.problem_reported_at)}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {s.reviews_awaiting_moderation > 0 ? (
          <section className="stack">
            <b>Reseñas ocultas para revisión ({s.reviews_awaiting_moderation})</b>
            {((reviews.data ?? []) as { id: string; rating: number; created_at: string }[]).map((r) => (
              <Link key={r.id} className="bell-row" href="/admin/resenas">
                <span>Reseña de {r.rating} estrellas</span>
                <span className="muted">{when(r.created_at)}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {s.pending_pro_applications > 0 ? (
          <section className="stack">
            <b>Solicitudes de profesionales ({s.pending_pro_applications})</b>
            {((pros.data ?? []) as { id: string; created_at: string }[]).map((p) => (
              <Link key={p.id} className="bell-row" href="/admin/pendientes">
                <span>Solicitud pendiente</span>
                <span className="muted">{when(p.created_at)}</span>
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </details>
  );
}
