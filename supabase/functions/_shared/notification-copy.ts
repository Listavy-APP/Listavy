// Spanish copy for transactional email (0091). Deno cannot import src/lib/i18n/es.ts, so the
// email strings live here. Keep them in step with the app's wording when either changes.
// Every template is plain text, like the verification email.

export type CopyContext = { appUrl: string; name: string | null; trade?: string; zone?: string };

export type RenderedEmail = { subject: string; text: string };

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

export function tradeName(trade: string | undefined): string {
  return (trade && TRADES[trade]) || "Trabajo";
}

function greet(name: string | null): string {
  return name ? `Hola ${name.split(" ")[0]},` : "Hola,";
}

function jobLine(ctx: CopyContext): string {
  return `${tradeName(ctx.trade)}${ctx.zone ? ` · ${ctx.zone}` : ""}`;
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
