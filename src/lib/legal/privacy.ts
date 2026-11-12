/**
 * Privacy policy content. The page in src/app/privacidad renders whatever is here.
 *
 * To publish the final text from legal counsel:
 *   1. Replace `sections` with the approved sections (a title and one or more paragraphs each).
 *   2. Set `updatedOn` to the approval date, as YYYY-MM-DD.
 *   3. Set `status` to "final". The draft notice then disappears.
 * No other file needs to change.
 *
 * The text below is the earlier working draft, kept as it was. It is not reviewed by a lawyer.
 */

export interface PolicySection {
  /** Section heading. Null for an untitled opening section. */
  title: string | null;
  paragraphs: readonly string[];
}

export interface PrivacyPolicy {
  status: "draft" | "final";
  /** Approval date, YYYY-MM-DD. Null while the text is a draft. */
  updatedOn: string | null;
  sections: readonly PolicySection[];
}

export const PRIVACY_POLICY: PrivacyPolicy = {
  status: "draft",
  updatedOn: null,
  sections: [
    {
      title: null,
      paragraphs: [
        "Usamos tu número de teléfono solo para iniciar sesión y enviarte códigos de verificación. No compartimos tu número en la búsqueda pública. Las fotos de cédula se guardan en un almacenamiento privado y solo las revisan administradores.",
      ],
    },
    {
      title: "Analítica de uso (borrador, pendiente de revisión legal)",
      paragraphs: [
        "Categoría: datos de uso de la app. Incluye páginas vistas (sin números de trabajo), idioma, tipo de dispositivo y versión de la app. Procesador: PostHog (nube, plan gratuito). Sin nombres, teléfonos, direcciones, descripciones, fotos ni notas de voz. Sin datos de pago. Sin grabación de sesión. Sin captura de dirección IP.",
        "Categoría: ubicación. Desactivada por defecto. Solo se guarda si la permites en una pantalla aparte. El profesional asignado la ve después de que el pago se confirme. Procesador: Supabase (base de datos de Listavy).",
      ],
    },
  ],
};
