import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACTION_LABELS: Record<string, string> = {
  admin_granted: "Administrador agregado",
  admin_promoted_super: "Ascendido a super administrador",
  admin_demoted_super: "Super administrador cambiado a administrador",
  admin_revoked: "Acceso de administrador eliminado",
  review_publish: "Reseña publicada",
  review_hide: "Reseña ocultada",
  review_remove: "Reseña eliminada",
  reply_publish: "Respuesta publicada",
  reply_hide: "Respuesta ocultada",
  dispute_decided: "Disputa decidida",
  pro_approved: "Profesional aprobado",
  pro_rejected: "Profesional rechazado",
};

const dateFmt = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

/** Recent admin actions. Read-only; rows are written by security definer functions only. */
export async function AuditLog() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, action, created_at, details")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <section className="stack">
      <h2>Bitácora de administración</h2>
      {error ? <p role="alert">No se pudo cargar la bitácora.</p> : null}
      {!error && (data ?? []).length === 0 ? <p className="muted">Sin acciones registradas.</p> : null}
      <ul className="list">
        {(data ?? []).map((row) => {
          const reason = typeof row.details?.reason === "string" ? ` · ${row.details.reason}` : "";
          return (
            <li key={row.id}>
              <span>{ACTION_LABELS[row.action] ?? row.action}{reason}</span>{" "}
              <span className="muted">{dateFmt.format(new Date(row.created_at))}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
