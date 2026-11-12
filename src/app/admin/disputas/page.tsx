import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { DisputeDecision } from "./DisputeDecision";
import { getCurrentProfile } from "@/lib/data/profiles";
import { listAdminDisputes, listEvidence, type DisputeRow } from "@/lib/data/disputes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Mediación de disputas" };

// Session-dependent page: read at request time, never cached.
export const instant = false;

const STAGE_LABEL: Record<string, string> = {
  filed: "Presentada",
  evidence: "Ventana de evidencia",
  decided: "Decidida",
  executed: "Ejecutada",
  closed: "Cerrada",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
}

export default async function DisputesDeskPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);
  if (!profile || profile.role !== "admin") notFound();

  const disputes = (await listAdminDisputes(supabase)) as DisputeRow[];
  const evidence = await listEvidence(supabase, disputes.map((d) => d.id));

  return (
    <section className="stack">
      <h1>Mediación de disputas</h1>
      {disputes.length === 0 ? <p className="muted">No hay disputas.</p> : null}
      {disputes.map((d) => (
        <article key={d.id} className="card stack">
          <h2>
            {STAGE_LABEL[d.stage] ?? d.stage} · {d.phase === "pre_release" ? "Antes de liberar" : "Defecto latente"}
          </h2>
          <p className="muted">
            Abierta por {d.opened_side === "homeowner" ? "el cliente" : "el profesional"} el {when(d.opened_at)} · Trabajo {d.job_id.slice(0, 8)}…
          </p>
          <p>Monto del trabajo: RD${d.payments?.amount_dop?.toLocaleString("es-DO") ?? "—"}</p>
          <p>
            <strong>Motivo:</strong> {d.reason}
          </p>
          <p className="muted">Evidencia hasta: {when(d.evidence_due_at)}</p>
          {evidence
            .filter((e) => e.dispute_id === d.id)
            .map((e) => (
              <blockquote key={`${e.dispute_id}-${e.side}`}>
                <strong>{e.side === "homeowner" ? "Cliente" : "Profesional"}:</strong> {e.statement}
              </blockquote>
            ))}
          {d.decision_reason ? <p>Decisión ({when(d.decided_at)}): {d.decision_reason}</p> : null}
          <DisputeDecision dispute={d} />
        </article>
      ))}
    </section>
  );
}
