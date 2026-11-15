import type { LegalDocument } from "./types";

/**
 * Cancellation policy. Rendered at /cancelacion by LegalDocumentView. Status stays "draft" until counsel approves.
 * The fee and grace period below are the approved terms. The cancellation code must match them before go-live.
 * Source: Additional policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 */
export const CANCELLATION_POLICY: LegalDocument = {
  id: "cancellation",
  status: "draft",
  version: "2026-11-15",
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
        "**Antes de que un profesional acepte.** Si ningún profesional ha aceptado el trabajo (etapas \"solicitado\" o \"cotizado\"), la cancelación es gratuita. Usted recibe un reembolso completo del monto pagado.",
        "**Después de que un profesional aceptó, antes de empezar el trabajo.** Si el profesional ya aceptó y usted cancela antes de que empiece el trabajo, usted recibe un reembolso del monto pagado menos una tarifa de cancelación de RD$500. La tarifa se le paga al profesional, como compensación por el tiempo reservado. Listavy no cobra comisión sobre la tarifa de cancelación. No hay tarifa si usted cancela dentro de las 2 horas siguientes a la aceptación del profesional.",
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
        "**El cliente no está disponible.** Si el profesional llega y el cliente no está presente ni ha dado instrucciones para poder hacer el trabajo, se trata como una cancelación del cliente (aplica la tarifa de cancelación si corresponde) o como una disputa, según el caso.",
      ],
    },
    {
      title: "Cómo se procesan los reembolsos y las tarifas",
      paragraphs: [
        "Listavy guarda el dinero del trabajo desde la reserva, así que la tarifa de cancelación se descuenta directamente del reembolso al cliente. No se hace ningún cobro adicional a su tarjeta. La tarifa se le transfiere al profesional por el mismo mecanismo de pago que los pagos por trabajos. Listavy no cobra comisión sobre un trabajo cancelado.",
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
