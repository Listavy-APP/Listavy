import type { LegalDocument } from "./types";

/**
 * Terms for professionals. Rendered at /pro/terminos by LegalDocumentView. Status stays "draft" until counsel approves.
 * Source: Additional policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 */
export const PRO_TERMS: LegalDocument = {
  id: "pro_terms",
  status: "draft",
  version: "2026-11-15",
  updatedOn: null,
  sections: [
    {
      title: "1. Usted es un profesional independiente",
      paragraphs: [
        "Usted es un negocio independiente que ofrece servicios a través de Listavy. Usted no es empleado, agente, socio, representante ni franquiciado de Listavy, y Listavy no es su empleador. Listavy no supervisa, dirige ni controla su trabajo. Usted presta los servicios bajo su propio nombre o el nombre de su empresa, con sus propias herramientas y materiales. Usted es responsable de sus obligaciones fiscales y legales como negocio independiente.",
      ],
    },
    {
      title: "2. Edad y capacidad",
      paragraphs: [
        "Usted debe tener al menos 18 años y poder formar contratos legalmente vinculantes.",
      ],
    },
    {
      title: "3. Verificación",
      paragraphs: [
        "Para ser aprobado como profesional independiente, usted proporciona una foto de su cédula de identidad, una selfie para confirmar que usted es el dueño del documento, un certificado de buena conducta vigente (emitido dentro de los últimos 30 días), que debe renovar cada año para mantener su insignia de verificado, y de 1 a 3 fotos de trabajos realizados. Puede aportar documentos de apoyo opcionales, como diplomas, certificaciones o licencias de su oficio; fortalecen su perfil, pero no son obligatorios. Las empresas proporcionan además el RNC activo de la empresa, el Registro Mercantil vigente, y la identificación del representante que abre la cuenta junto con el documento que lo autoriza a representar a la empresa. Un administrador revisa su solicitud dentro de 2 días laborables. Listavy nunca aprueba profesionales automáticamente: la insignia de verificado es la promesa central del servicio. Si su solicitud es rechazada, verá la razón en la app y podrá corregirla y reenviarla. No hay límite de reenvíos.",
        "La insignia de verificado indica que verificamos su identidad y sus documentos. Si su certificado de buena conducta vence, la insignia se retira hasta que lo renueve; su cuenta sigue activa. No indica ni garantiza la calidad de sus servicios. Usted es responsable de cuidar la información de acceso a su cuenta para evitar que un tercero la use.",
      ],
    },
    {
      title: "4. Calificación y licencias",
      paragraphs: [
        "Usted debe estar calificado para los servicios que ofrece y, cuando la ley exija una licencia para el oficio en el lugar donde se realiza el trabajo, debe tenerla. Usted es responsable de cumplir con las leyes y regulaciones aplicables a su oficio.",
      ],
    },
    {
      title: "5. Cómo funcionan los trabajos",
      paragraphs: [
        "Usted recibe solicitudes de trabajo, envía cotizaciones (válidas por 48 horas) y responde dentro de 24 horas. Un trabajo puede tener hasta 3 profesionales cotizando. Usted fija su rango de precios en su perfil. Cuando el cliente acepta su cotización y paga, el trabajo queda reservado. Usted empieza el trabajo desde la app (\"Llegué, iniciar trabajo\"). El cliente aprueba el trabajo cuando termina. Usted recibe su pago 24 horas después de la aprobación del cliente.",
      ],
    },
    {
      title: "6. Comisión y pagos",
      paragraphs: [
        "Listavy cobra una comisión sobre el monto del trabajo: 15% para trabajos de menos de RD$5,000 (mínimo RD$400, sin mínimo para diagnósticos), 12% para trabajos de RD$5,000 a RD$25,000, y 10% para trabajos de más de RD$25,000, con un tope de RD$15,000 por trabajo. Con el plan Pro (RD$2,950 al mes), la comisión es de 8%, sin mínimo. El cliente paga al reservar. Listavy guarda el dinero hasta que el cliente apruebe el trabajo, y usted recibe su pago 24 horas después de la aprobación. Listavy no garantiza trabajos ni ingresos: las solicitudes no son trabajos garantizados.",
      ],
    },
    {
      title: "7. Sus obligaciones",
      paragraphs: [
        "Llegue a tiempo y haga el trabajo como lo cotizó.",
        "Comuníquese con el cliente a través de Listavy y responda dentro de 24 horas.",
        "Respete la casa y la propiedad del cliente.",
        "No pida pagos fuera de la Plataforma. No comparta la información privada del cliente con terceros.",
        "No discrimine a ningún cliente. Trate a todos con respeto.",
        "Si no puede hacer un trabajo que aceptó, cancele en la app lo antes posible. Las cancelaciones y no-shows cuentan en su historial (vea la Política de Cancelación).",
      ],
    },
    {
      title: "8. Reseñas y posición en la Plataforma",
      paragraphs: [
        "Después de un trabajo completado, el cliente puede dejarle una reseña (hasta 500 caracteres) y usted puede responder (hasta 500 caracteres). Las reseñas están ocultas mientras haya una disputa abierta sobre ese trabajo. Tres calificaciones bajas en 90 días → advertencia. Cinco calificaciones bajas → bloqueo de nuevas solicitudes. El administrador puede levantar el bloqueo. Las cancelaciones y no-shows también cuentan en su historial.",
      ],
    },
    {
      title: "9. Suspensión y terminación",
      paragraphs: [
        "Listavy puede suspender o eliminar su cuenta por violar estos Términos, las Reglas de la Comunidad o los Términos de Uso, por fraude, por cancelaciones repetidas o por calificaciones bajas repetidas. Usted puede cerrar su cuenta en cualquier momento en /cuenta. Si su cuenta se cierra, se aplican las reglas de retención y eliminación de la Política de Privacidad.",
      ],
    },
    {
      title: "10. Sin garantía de trabajos",
      paragraphs: [
        "Listavy no garantiza que usted recibirá solicitudes, cotizaciones aceptadas ni trabajos, ni garantiza ningún nivel de ingresos.",
      ],
    },
    {
      title: "11. Ley aplicable",
      paragraphs: [
        "Estos Términos para Profesionales se rigen por las leyes del estado de Pensilvania, Estados Unidos de América, y cualquier controversia se resolverá exclusivamente por los tribunales de Pensilvania, igual que en los Términos de Uso.",
      ],
    },
    {
      title: "12. Cambios a estos Términos",
      paragraphs: [
        "LISTAVY podrá actualizar estos Términos para Profesionales. Cuando un cambio sea importante, se lo notificaremos en la Plataforma antes de que el cambio entre en vigor. El uso continuado de la Plataforma después de un cambio significa que usted acepta los Términos actualizados.",
      ],
    },
    {
      title: "Cómo contactarnos",
      paragraphs: [
        "Si tiene preguntas sobre estas políticas, comuníquese con nosotros a hola@listavy.com. Operador: Espiga Capital LLC, marca Listavy.",
      ],
    },
  ],
};
