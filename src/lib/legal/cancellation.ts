import type { LegalDocument } from "./types";

/**
 * Cancellation policy. Rendered at /cancelacion by LegalDocumentView. Status stays "draft" until counsel approves.
 * Client cancellation and refund processing follow the approved 2026-11-20 text (RD$300 fee after the 2-hour grace).
 * Keep this text in line with cancel_job_with_refund and _settle_cancellation (migration 0107).
 * Other sections: Additional policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 */
export const CANCELLATION_POLICY: LegalDocument = {
  id: "cancellation",
  status: "draft",
  version: "2026-11-20",
  updatedOn: null,
  sections: [
    {
      title: "Cómo cancelar",
      paragraphs: [
        "Usted puede cancelar un trabajo desde la página del trabajo en la Plataforma, en cualquier momento antes de que el trabajo se complete. Si el trabajo ya está en curso, la cancelación se maneja como una disputa (vea abajo).",
      ],
    },
    {
      title: "Si el cliente cancela",
      paragraphs: [
        "**Antes de reservar con un profesional.** Si el trabajo aún no está reservado con un profesional (etapas \"solicitado\" o \"cotizado\") o usted aún no ha pagado, la cancelación es gratuita. Si ya pagó algún monto, recibe un reembolso completo.",
        "**Dentro de las 2 horas siguientes a la reserva.** Si usted ya reservó con un profesional y pagó, puede cancelar sin costo dentro de las 2 horas siguientes al pago. Recibe un reembolso completo del monto pagado.",
        "**Después de las 2 horas, antes de que el trabajo empiece.** Si cancela pasadas las 2 horas desde el pago y antes de que el profesional empiece el trabajo, se retiene una tarifa de cancelación de RD$300 del monto pagado, y el resto se le reembolsa. La tarifa se entrega al profesional, como compensación por el tiempo reservado. La tarifa nunca será mayor que el monto pagado. Antes de confirmar la cancelación, la Plataforma le mostrará el monto exacto que se retendrá y el monto que se le reembolsará.",
        "**Después de que el trabajo empezó.** Si el trabajo ya está en curso, la cancelación se maneja como una disputa. Usted abre una disputa y el administrador decide el reembolso parcial según el trabajo realizado, igual que en el proceso de disputas de los Términos de Uso. El pago queda congelado mientras la disputa está abierta.",
      ],
    },
    {
      title: "Si el profesional cancela",
      paragraphs: [
        "**Antes de empezar el trabajo.** Si el profesional cancela después de aceptar pero antes de empezar, el cliente recibe un reembolso completo. No hay tarifa para el cliente. La cancelación cuenta como una falta en el historial del profesional.",
        "**Después de empezar el trabajo.** Si el profesional cancela con el trabajo en curso, se maneja como una disputa. El cliente recibe un reembolso según el trabajo realizado, decidido por el administrador.",
        "**Cancelaciones repetidas.** Las cancelaciones y no-shows repetidos del profesional afectan su posición en la Plataforma. Tres faltas en 90 días → advertencia. Cinco faltas → bloqueo de nuevas solicitudes. El administrador puede levantar el bloqueo. Listavy puede suspender o eliminar la cuenta de un profesional por cancelaciones repetidas o por fraude.",
      ],
    },
    {
      title: "No-show (no presentarse)",
      paragraphs: [
        "**El profesional no se presenta.** Si el profesional no llega ni empieza el trabajo en el tiempo acordado, el cliente recibe un reembolso completo. Cuenta como una cancelación del profesional.",
        "**El cliente no está disponible.** Si el profesional llega al lugar y usted no está presente ni ha dado instrucciones para poder hacer el trabajo, se trata como una cancelación del cliente después de las 2 horas: se retiene la tarifa de cancelación de RD$300, que se entrega al profesional, y el resto se le reembolsa. Si el caso es distinto, puede manejarse como disputa.",
      ],
    },
    {
      title: "Cómo se procesan los reembolsos",
      paragraphs: [
        "Listavy guarda el dinero del trabajo desde la reserva. Si usted cancela antes de reservar con un profesional, o dentro de las 2 horas siguientes al pago, recibe un reembolso completo del monto pagado. Si cancela después de ese período y antes de que el trabajo empiece, se retiene la tarifa de cancelación de RD$300 (que se entrega al profesional) y se le reembolsa el resto. No se hace ningún cobro adicional a su tarjeta. Listavy no cobra comisión sobre un trabajo cancelado ni sobre la tarifa de cancelación.",
      ],
    },
    {
      title: "Cambios a esta Política",
      paragraphs: [
        "LISTAVY podrá actualizar esta Política de Cancelación. Cuando un cambio sea importante, se lo notificaremos en la Plataforma antes de que el cambio entre en vigor. El uso continuado de la Plataforma después de un cambio significa que usted acepta la Política actualizada.",
      ],
    },
  ],
};
