import Link from "next/link";
import { ResolveCheckinButton } from "./ResolveCheckinButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const KIND: Record<string, string> = { arrival: "Llegada", midjob: "Mitad del trabajo", overrun: "Fuera de tiempo" };
const ANSWER: Record<string, string> = {
  yes: "Sí, llegó", no: "No llegó", ok: "Todo bien", problem: "Hay un problema",
  running: "Sigue en curso", finished: "Ya terminó",
};
const dateFmt = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

/** Open problem flags from job check-ins (migration 0063). Admins resolve them here. */
export async function CheckinProblems() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_checkin_problems");
  const rows = error ? [] : (data ?? []);
  return (
    <section className="stack">
      <h2>Problemas reportados en trabajos</h2>
      {error ? <p role="alert">No se pudieron cargar los problemas.</p> : null}
      {!error && rows.length === 0 ? <p className="muted">Sin problemas abiertos.</p> : null}
      {rows.map((r: { id: string; job_id: string; kind: string; answer: string | null; problem_reported_at: string; client_name: string | null; trade: string; zone: string }) => (
        <article key={r.id} className="card stack">
          <p>
            <strong>{r.client_name ?? "Cliente"}</strong> · {r.trade} · {r.zone}
          </p>
          <p className="muted">
            {KIND[r.kind] ?? r.kind} · {ANSWER[r.answer ?? ""] ?? "Sin respuesta"} · {dateFmt.format(new Date(r.problem_reported_at))}
          </p>
          <div className="chip-row">
            <Link className="button secondary" href={`/trabajos/${r.job_id}`}>Ver trabajo</Link>
            <ResolveCheckinButton id={r.id} />
          </div>
        </article>
      ))}
    </section>
  );
}
