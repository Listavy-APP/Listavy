/**
 * The three tour steps. Single source: the first-run tour and the /cuenta replay both read this.
 * Copy stays inside what the policies promise. No prices, no coverage, no launch claims.
 */
export const CLIENT_TOUR_STEPS = [
  {
    id: "pide",
    title: "Pide un servicio",
    body: "Describe el trabajo. Hasta tres profesionales verificados te envían cotización.",
  },
  {
    id: "compara",
    title: "Compara y acepta",
    body: "Ves los precios antes de comprometerte. Tú decides con quién sigues.",
  },
  {
    id: "paga",
    title: "Paga seguro",
    body: "Tu pago queda retenido. Se libera solo cuando apruebas el trabajo terminado.",
  },
] as const;

export const CLIENT_TOUR_STRINGS = {
  dialogLabel: "Cómo funciona Listavy",
  stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
  next: "Siguiente",
  skip: "Saltar",
  finish: "Pedir un servicio",
  replayLink: "Cómo funciona",
  stampError: "No se pudo guardar tu progreso. Lo verás de nuevo la próxima vez.",
} as const;
