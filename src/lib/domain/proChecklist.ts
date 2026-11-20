/** Pro profile checklist (8c). Pure rules; the state comes from get_my_pro_checklist(). */

export type ChecklistItem = "verificacion" | "foto" | "pago" | "descripcion" | "horario" | "precios" | "zona";
export type ChecklistState = "done" | "pending" | "missing";
export type ChecklistVisibility = "public" | "private";

export type ChecklistRow = {
  item: ChecklistItem;
  state: ChecklistState;
  visibility: ChecklistVisibility;
  priority: number | null;
  dismissed: boolean;
};

/**
 * The one nudge to show, or null. Only missing items with a priority qualify, lowest number first.
 * If that top item was dismissed, no nudge shows until the top item changes (it is completed,
 * or the pro's state moves it out of first place).
 */
export function nudgeFor(rows: ChecklistRow[]): ChecklistRow | null {
  const candidates = rows
    .filter((r) => r.state === "missing" && r.priority !== null)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const top = candidates[0];
  if (!top || top.dismissed) return null;
  return top;
}

export function doneCount(rows: ChecklistRow[]): { done: number; total: number } {
  return { done: rows.filter((r) => r.state === "done").length, total: rows.length };
}
