import Link from "next/link";
import type { ChecklistItem, ChecklistRow } from "@/lib/domain/proChecklist";
import { doneCount } from "@/lib/domain/proChecklist";
import { es } from "@/lib/i18n/es";

/** Where each item is fixed. Null: the app has no screen for it, so the row shows no link. */
const FIX_PATH: Record<ChecklistItem, string | null> = {
  verificacion: "/pro/verificacion",
  foto: "/cuenta",
  pago: "/pro/pagos",
  descripcion: "/pro/estado#descripcion",
  horario: "/pro/horario",
  precios: null,
  zona: null,
};

/** Guidance only. Lists what the profile is missing. Never gates the pro. */
export function ProChecklist({ rows }: { rows: ChecklistRow[] }) {
  if (rows.length === 0) return null;
  const { done, total } = doneCount(rows);
  return (
    <section className="panel stack" aria-labelledby="pro-checklist-title">
      <h2 id="pro-checklist-title">{es.proChecklist.title}</h2>
      <p className="muted">{es.proChecklist.intro}</p>
      <p>
        {done}/{total} {es.proChecklist.progress}
      </p>
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {rows.map((r) => {
          const fix = FIX_PATH[r.item];
          const stateLabel = es.proChecklist[r.state];
          return (
            <li key={r.item} className="stack" style={{ gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <strong>{es.proChecklist.items[r.item]}</strong>
                <span className="status-pill">{stateLabel}</span>
              </div>
              <span className="muted">
                {r.visibility === "public" ? es.proChecklist.visibilityPublic : es.proChecklist.visibilityPrivate}
              </span>
              {r.state !== "done" && fix ? (
                <Link className="button secondary" href={fix} style={{ minHeight: 44 }}>
                  {es.proChecklist.complete}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
