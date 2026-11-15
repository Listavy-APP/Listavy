import type { LegalDocument } from "./types";

/**
 * Community rules. Rendered at /comunidad by LegalDocumentView. Status stays "draft" until counsel approves.
 * Source: Additional policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 */
export const COMMUNITY_RULES: LegalDocument = {
  id: "community",
  status: "draft",
  version: "2026-11-15",
  updatedOn: null,
  sections: [
    {
      title: "Compromiso de la comunidad",
      paragraphs: [
        "Listavy es una comunidad de dueños de casa y profesionales que se tratan con respeto. Al usar Listavy, usted acepta tratar a todos en la comunidad con respeto, sin importar su raza, religión, origen nacional, etnia, discapacidad, sexo, identidad de género, orientación sexual o edad.",
      ],
    },
    {
      title: "No discriminación",
      paragraphs: [
        "Usted no puede negar un servicio ni tratar a alguien de forma diferente por sus características protegidas (raza, religión, origen nacional, etnia, discapacidad, sexo, identidad de género, orientación sexual o edad), ni por la percepción de que tiene alguna de ellas. Tampoco puede usar lenguaje que pida la exclusión, segregación o violencia contra otros por estas características, ni lenguaje que degrade, insulte o estereotype a alguien por ellas. No puede mostrar símbolos, objetos, imágenes o lemas que sean odiosos o discriminatorios.",
      ],
    },
    {
      title: "Honestidad",
      paragraphs: [
        "Proporcione información verdadera y actualizada en su perfil y en sus solicitudes de trabajo.",
        "Las reseñas deben ser honestas y basadas en un trabajo real. No publique reseñas falsas, ni pida ni pague por reseñas falsas.",
        "No cree cuentas falsas ni se haga pasar por otra persona o empresa.",
        "Las fotos de trabajos deben ser de trabajos reales que usted hizo (profesionales) o del problema real (clientes). No use fotos de otros ni fotos engañosas.",
      ],
    },
    {
      title: "Seguridad y respeto",
      paragraphs: [
        "No acose, amenace ni intimide a nadie, en la Plataforma ni fuera de ella.",
        "No ofrezca ni realice servicios ilegales.",
        "No comparta la información privada de otra persona (teléfono, dirección, documentos) con terceros.",
        "Respete la casa y la propiedad del cliente. Respete el tiempo y el trabajo del profesional.",
      ],
    },
    {
      title: "Manténgalo en Listavy",
      paragraphs: [
        "Todos los pagos y toda la comunicación sobre un trabajo deben pasar por Listavy.",
        "No pida ni acepte pagos fuera de la Plataforma para evitar la comisión. Si un profesional le pide pagar en efectivo o por otro medio para \"ahorrar la comisión\", usted pierde la protección de Listavy: no hay registro de pago, no hay mediación en disputas y no hay cobertura de garantía.",
        "No comparta su número de teléfono ni otros datos de contacto para sacar la contratación fuera de la Plataforma. El teléfono solo se comparte con la otra parte cuando el trabajo está pagado y aceptado.",
        "No use la Plataforma para captar clientes o profesionales para servicios fuera de Listavy.",
      ],
    },
    {
      title: "Contenido",
      paragraphs: [
        "No use lenguaje ofensivo en reseñas, mensajes ni descripciones. Las reseñas y respuestas con lenguaje ofensivo se ocultan automáticamente para revisión.",
        "No publique spam, publicidad de otros servicios ni enlaces engañosos.",
        "Usted es responsable del contenido que publica (texto, imágenes, video, notas de voz) y de que no viole derechos de terceros.",
      ],
    },
    {
      title: "Reportar un problema",
      paragraphs: [
        "Si alguien viola estas reglas, repórtelo con el botón \"Reportar\" en el perfil del profesional o escriba a listavyapp@gmail.com. Listavy investiga los reportes y toma las medidas que correspondan.",
      ],
    },
    {
      title: "Consecuencias",
      paragraphs: [
        "Violar estas reglas puede resultar en: advertencia, suspensión temporal, bloqueo de nuevas solicitudes o eliminación permanente de la cuenta. La gravedad de la medida depende de la violación y de si se repite. Las decisiones del administrador son finales en la Plataforma. Listavy puede bloquear el acceso a una cuenta si tiene motivos para sospechar fraude o abuso de los Términos de Uso.",
      ],
    },
  ],
};
