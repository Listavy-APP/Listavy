// Spanish copy for transactional email (0091). Deno cannot import src/lib/i18n/es.ts, so the
// email strings live here. Keep them in step with the app's wording when either changes.
// Every template is plain text, like the verification email.

/** tradeLabel: the professional name from the trades catalog (0109). Preferred over the fallback map. */
export type CopyContext = { appUrl: string; name: string | null; trade?: string; tradeLabel?: string; zone?: string };

export type RenderedEmail = { subject: string; text: string };

/** Fallback names for the seven original trades only. The catalog (trades table) is the source; new lines always arrive as tradeLabel. */
const TRADES: Record<string, string> = {
  plumber: "Plomero",
  electrician: "Electricista",
  ac_technician: "Técnico de aire acondicionado",
  painter: "Pintor",
  locksmith: "Cerrajero",
  carpenter: "Carpintero",
  blacksmith: "Herrero",
};

const OUTCOMES: Record<string, string> = {
  resolved_homeowner: "El caso se resolvió a favor del cliente.",
  resolved_pro: "El caso se resolvió a favor del profesional.",
};

export function tradeName(trade: string | undefined, label?: string): string {
  return label || (trade && TRADES[trade]) || "Trabajo";
}

function greet(name: string | null): string {
  return name ? `Hola ${name.split(" ")[0]},` : "Hola,";
}

function jobLine(ctx: CopyContext): string {
  return `${tradeName(ctx.trade, ctx.tradeLabel)}${ctx.zone ? ` · ${ctx.zone}` : ""}`;
}

function footer(): string {
  return "\n\nListavy · Si no esperabas este correo, puedes ignorarlo.";
}

export function renderEmail(kind: string, data: Record<string, unknown>, ctx: CopyContext): RenderedEmail | null {
  const jobUrl = `${ctx.appUrl}/trabajos/${data.job_id ?? ""}`;
  const hi = greet(ctx.name);
  switch (kind) {
    case "welcome":
      return {
        subject: "Bienvenido a Listavy",
        text: `${hi}\n\nTu correo quedó verificado. Ya puedes pedir cotizaciones a profesionales verificados.\n\n${ctx.appUrl}${footer()}`,
      };
    case "job_quote_received": {
      const amount = typeof data.amount_dop === "number" ? `RD$${data.amount_dop.toLocaleString("es-DO")}` : "";
      return {
        subject: "Recibiste una cotización",
        text: `${hi}\n\nRecibiste una cotización para tu trabajo (${jobLine(ctx)})${amount ? `: ${amount}` : ""}.\n\nRevísala y decide: ${jobUrl}${footer()}`,
      };
    }
    case "job_accepted":
      return {
        subject: "Tu trabajo quedó agendado",
        text: `${hi}\n\nTu trabajo (${jobLine(ctx)}) quedó agendado.\n\nDetalles: ${jobUrl}${footer()}`,
      };
    case "job_started":
      return {
        subject: "Tu trabajo comenzó",
        text: `${hi}\n\nEl profesional inició tu trabajo (${jobLine(ctx)}).\n\nDetalles: ${jobUrl}${footer()}`,
      };
    case "job_completed":
      return {
        subject: "Revisa y aprueba tu trabajo",
        text: `${hi}\n\nEl profesional marcó tu trabajo (${jobLine(ctx)}) como terminado. Revísalo y apruébalo para liberar el pago.\n\nRevisar: ${jobUrl}${footer()}`,
      };
    case "job_cancelled_refund": {
      const refund = typeof data.refund_dop === "number" ? `RD$${data.refund_dop.toLocaleString("es-DO")}` : "";
      const fee = typeof data.fee_dop === "number" ? data.fee_dop : 0;
      const feeLine = fee > 0 ? ` Se descontó una tarifa de cancelación de RD$${fee.toLocaleString("es-DO")} para el profesional.` : "";
      return {
        subject: "Tu trabajo fue cancelado",
        text: `${hi}\n\nTu trabajo (${jobLine(ctx)}) fue cancelado.${refund ? ` Reembolso: ${refund}.` : ""}${feeLine}\n\nDetalles: ${jobUrl}${footer()}`,
      };
    }
    case "job_paid":
      return {
        subject: "Pago liberado",
        text: `${hi}\n\nEl pago de tu trabajo (${jobLine(ctx)}) fue liberado al profesional.\n\nDetalles: ${jobUrl}${footer()}`,
      };
    case "receipt": {
      const amount = typeof data.amount_dop === "number" ? `RD$${data.amount_dop.toLocaleString("es-DO")}` : "—";
      const when = typeof data.paid_at === "string" ? formatDate(data.paid_at) : "—";
      const link = typeof data.receipt_url === "string" ? `\nRecibo de Stripe: ${data.receipt_url}` : "";
      return {
        subject: "Recibo de tu pago en Listavy",
        text: `${hi}\n\nRecibimos tu pago.\n\nMonto: ${amount}\nTrabajo: ${jobLine(ctx)}\nFecha: ${when}${link}\n\nDetalles: ${jobUrl}${footer()}`,
      };
    }
    case "dispute_opened_opener":
      return {
        subject: "Recibimos tu disputa",
        text: `${hi}\n\nRecibimos tu disputa sobre el trabajo (${jobLine(ctx)}). La otra parte tiene un plazo para responder. Te avisaremos de la decisión.\n\nDetalles: ${jobUrl}${footer()}`,
      };
    case "dispute_opened_other":
      return {
        subject: "Se abrió una disputa en tu trabajo",
        text: `${hi}\n\nSe abrió una disputa sobre el trabajo (${jobLine(ctx)}). Tienes un plazo para enviar tu versión y tus fotos.\n\nDetalles: ${jobUrl}${footer()}`,
      };
    case "dispute_decided": {
      const outcome = (typeof data.outcome === "string" && OUTCOMES[data.outcome]) || "Se tomó una decisión sobre la disputa.";
      const reason = typeof data.reason === "string" && data.reason ? `\nMotivo: ${data.reason}` : "";
      return {
        subject: "Decisión sobre tu disputa",
        text: `${hi}\n\n${outcome}${reason}\n\nDetalles: ${jobUrl}${footer()}`,
      };
    }
    case "support_reply": {
      const subject = typeof data.subject === "string" && data.subject ? `\nAsunto: ${data.subject}` : "";
      return {
        subject: "Respondimos tu ticket de soporte",
        text: `${hi}\n\nHay una respuesta en tu ticket de soporte.${subject}\n\nRevísala aquí: ${ctx.appUrl}/ayuda/tickets/${data.ticket_id ?? ""}${footer()}`,
      };
    }
    case "recurring_auto_paused": {
      const trade = tradeName(typeof data.trade === "string" ? data.trade : undefined, ctx.tradeLabel);
      return {
        subject: "Pausamos tu trabajo recurrente",
        text: `${hi}\n\nPausamos tu serie de trabajos recurrentes (${trade}) porque tu profesional ya no está disponible para este servicio. No se creará ninguna solicitud mientras la serie esté pausada.\n\nRevisa la serie y decide qué hacer: ${ctx.appUrl}/cuenta/recurrentes${footer()}`,
      };
    }
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

// Deep link stored with each sent notification (0098). The inbox opens it. Only internal paths pass.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function linkFor(kind: string, data: Record<string, unknown>): string | null {
  const job = typeof data.job_id === "string" && ID_RE.test(data.job_id) ? data.job_id : null;
  const ticket = typeof data.ticket_id === "string" && ID_RE.test(data.ticket_id) ? data.ticket_id : null;
  if (kind === "support_reply") return ticket ? `/ayuda/tickets/${ticket}` : "/ayuda/tickets";
  if (kind.startsWith("recurring_")) return "/cuenta/recurrentes";
  return job ? `/trabajos/${job}` : null;
}

export function safeLink(url: unknown): string | null {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && url.length <= 300 ? url : null;
}
