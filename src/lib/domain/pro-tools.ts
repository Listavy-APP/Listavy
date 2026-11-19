// Pure rules for the pro tools (item 7a). No I/O. The SQL in migration 0093 is the source of the numbers.

/** Gross job amount from the pro's net, commission and tip. Mirrors pro_annual_statement: net = gross - commission + tip. */
export function grossFromNet(netDop: number, commissionDop: number, tipDop: number): number {
  return netDop + commissionDop - tipDop;
}

/** Bar height as a whole percent of the largest value. Zero when nothing is above zero. */
export function barPercent(amount: number, max: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(max) || max <= 0 || amount <= 0) return 0;
  return Math.min(100, Math.round((amount / max) * 100));
}

export const TEMPLATE_LIMITS = { titleMax: 60, noteMax: 1000 } as const;

export type TemplateInput = { title: string; amountDop: number; note: string | null };

export const TEMPLATE_MSG = {
  title: "Escribe un nombre para la plantilla (hasta 60 letras).",
  amount: "El monto debe ser mayor que cero.",
  note: "La nota no puede pasar de 1000 letras.",
} as const;

/** Validates a template before it is saved. The database checks the same rules. */
export function validateTemplate(raw: { title: string; amount: string; note: string }):
  | { ok: true; value: TemplateInput }
  | { ok: false; error: string } {
  const title = raw.title.trim();
  if (title.length < 1 || title.length > TEMPLATE_LIMITS.titleMax) return { ok: false, error: TEMPLATE_MSG.title };
  const amountDop = Number(raw.amount.replace(/\D/g, ""));
  if (!Number.isInteger(amountDop) || amountDop <= 0) return { ok: false, error: TEMPLATE_MSG.amount };
  const note = raw.note.trim();
  if (note.length > TEMPLATE_LIMITS.noteMax) return { ok: false, error: TEMPLATE_MSG.note };
  return { ok: true, value: { title, amountDop, note: note.length > 0 ? note : null } };
}
