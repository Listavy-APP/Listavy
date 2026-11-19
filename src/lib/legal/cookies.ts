import type { LegalDocument } from "./types";

/**
 * Cookie policy content. Rendered at /cookies by LegalDocumentView.
 * Source: Corotos policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 * Paragraphs that start with **bold text** render that part bold. Other markdown is not supported.
 */
export const COOKIES_POLICY: LegalDocument = {
  id: "cookies",
  status: "draft",
  version: "2026-11-15",
  updatedOn: null,
  sections: [
    {
      title: null,
      paragraphs: [
        "**Qué son las cookies.** Las cookies son pequeños archivos de texto que se guardan en su navegador o dispositivo para que el sitio recuerde cierta información. LISTAVY también usa almacenamiento local con el mismo fin. Esta Política explica qué cookies usa LISTAVY, para qué, y cómo puede controlarlas.",
      ],
    },
    {
      title: "Cookies que usa LISTAVY hoy",
      paragraphs: [
        "**Cookies esenciales / de sesión.** Necesarias para que la Plataforma funcione: mantienen su sesión iniciada después de verificar su número de teléfono. Sin ellas, deberá iniciar sesión cada vez que visite la Plataforma. Proveedor: Supabase (autenticación). No se pueden desactivar sin perder el inicio de sesión.",
        "**Cookies de analítica.** Solo se usan si usted activa la analítica en /ajustes. La analítica está desactivada por defecto. Cuando está activa, registra solo páginas vistas (sin números de trabajo), idioma, tipo de dispositivo y versión de la app. Proveedor: PostHog. Sin nombres, teléfonos, direcciones, descripciones, fotos ni notas de voz. Sin datos de pago. Sin grabación de sesión. Sin captura de dirección IP.",
        "**Cookies de pago.** Cuando usted paga un trabajo, el proveedor de pagos (Stripe) puede usar cookies para procesar el pago de forma segura y prevenir el fraude. LISTAVY no guarda los datos de su tarjeta.",
        "**LISTAVY no usa cookies publicitarias ni de seguimiento de terceros para publicidad.** No vendemos ni compartimos datos de cookies con anunciantes.",
      ],
    },
    {
      title: "Cómo controlar las cookies",
      paragraphs: [
        "Usted puede activar o desactivar la analítica en /ajustes en cualquier momento. También puede configurar su navegador para no aceptar cookies o para eliminarlas; en ese caso deberá iniciar sesión cada vez que visite la Plataforma y la analítica no funcionará. La configuración de cookies de su navegador no afecta las cookies esenciales de sesión mientras esté usando la Plataforma.",
      ],
    },
    {
      title: "Cookies que podremos usar en el futuro",
      paragraphs: [
        "A medida que LISTAVY crezca, podremos añadir nuevos tipos de cookies (por ejemplo, para nuevas funciones o para publicidad). Antes de añadir un nuevo tipo de cookie, actualizaremos esta Política y se lo notificaremos, y pediremos su consentimiento cuando la ley lo requiera.",
      ],
    },
    {
      title: "Cómo contactarnos",
      paragraphs: [
        "Si tiene preguntas sobre esta Política de Cookies, comuníquese con nosotros a hola@listavy.com.",
      ],
    },
  ],
};
