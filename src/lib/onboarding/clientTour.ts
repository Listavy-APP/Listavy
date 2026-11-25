/**
 * The three tour steps. Single source: the first-run tour and the /cuenta replay both read this.
 * Copy stays inside what the policies promise. No prices, no coverage, no launch claims.
 * Per step: kicker (small caps label), title, subtitle, and body (the description).
 */
export const CLIENT_TOUR_STEPS = [
  {
    id: "pide",
    image: "/tour/tour-step1.jpg",
    alt: "Clienta pidiendo un plomero desde su celular",
    kicker: "TU LISTA DE PENDIENTES EMPIEZA AQUÍ",
    title: "Cuéntanos qué necesitas.",
    subtitle: "Grande o pequeño, empezar es fácil.",
    body: "Publica tu trabajo en pocos pasos. Dinos qué hay que hacer y deja que los profesionales lleguen a ti.",
  },
  {
    id: "compara",
    image: "/tour/tour-step2.jpg",
    alt: "Profesional de Listavy saludando a una clienta",
    kicker: "ENCUENTRA A TU PERSONA",
    title: "Buena gente. Buen trabajo.",
    subtitle: "La ayuda correcta está más cerca de lo que crees.",
    body: "Conecta con profesionales verificados, compara cotizaciones y encuentra a quien encaje con tu trabajo.",
  },
  {
    id: "paga",
    image: "/tour/tour-step3.jpg",
    alt: "Clienta feliz mostrando un servicio completado en su celular",
    kicker: "ES UNA MENOS",
    title: "Hecho. Qué bien se siente.",
    subtitle: "Dedica tiempo a lo que importa.",
    body: "Elige a tu profesional, termina el trabajo y tacha una cosa más de tu lista. Tu pago queda retenido y se libera solo cuando apruebas el trabajo terminado.",
  },
] as const;

export const CLIENT_TOUR_STRINGS = {
  dialogLabel: "Cómo funciona Listavy",
  stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
  next: "Siguiente",
  skip: "Saltar",
  finish: "Empecemos",
  replayLink: "Cómo funciona",
  stampError: "No se pudo guardar tu progreso. Lo verás de nuevo la próxima vez.",
  /** Step 1 intro header: wordmark and line. */
  introWordmark: "listavy",
  introLine: "La vida es ajetreada. Hacemos que resolver sea más fácil.",
  /** Muted line under the bottom button, every step. */
  footer: "Tu lista de pendientes. Nuestra gente.",
} as const;
