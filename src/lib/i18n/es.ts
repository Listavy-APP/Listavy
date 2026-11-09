/**
 * All user-facing copy for v1. Dominican Spanish, plain language.
 * No hard-coded strings in components. Add keys here.
 */
export const es = {
  brand: "Listavy",
  common: {
    loading: "Cargando…",
    back: "Volver",
    errorGeneric: "Algo salió mal. Intenta de nuevo.",
    retry: "Intentar otra vez",
  },
  notFound: {
    title: "Página no encontrada",
    body: "La página que buscas no existe o se movió.",
    home: "Ir al inicio",
  },
  home: {
    title: "Profesionales verificados en Santo Domingo",
    subtitle: "Plomería, electricidad y aire acondicionado. Un profesional, un precio aprobado, con fotos antes y después.",
    loginCta: "Entrar con WhatsApp",
    accountCta: "Mi cuenta",
    comingSoon: "La búsqueda de profesionales se activa en la próxima etapa.",
  },
  login: {
    title: "Entrar con tu teléfono",
    phoneLabel: "Número de teléfono",
    phoneHint: "Incluye el código de país. Ejemplo: +1 809 555 1234",
    sendCode: "Enviar código por WhatsApp",
    sending: "Enviando…",
    codeLabel: "Código de 6 dígitos",
    codeHint: "Te llegó por WhatsApp.",
    verify: "Confirmar código",
    verifying: "Confirmando…",
    changeNumber: "Cambiar número",
    invalidPhone: "Revisa el número. Debe incluir el código de país, por ejemplo +1 809 555 1234.",
    invalidCode: "El código debe tener 6 dígitos.",
    sendFailed: "No pudimos enviar el código. Revisa el número e intenta otra vez.",
    verifyFailed: "El código no es válido o ya venció. Pide uno nuevo.",
    sentTo: "Enviamos un código a",
  },
  account: {
    title: "Mi cuenta",
    phone: "Teléfono",
    role: "Tipo de cuenta",
    roles: {
      homeowner: "Propietario",
      pro: "Profesional",
      admin: "Administrador",
    },
    noProfile: "No encontramos tu perfil. Cierra sesión y entra de nuevo.",
    signOut: "Cerrar sesión",
  },
  trades: {
    plumber: "Plomero",
    electrician: "Electricista",
    ac_technician: "Técnico de aire acondicionado",
  },
  money: {
    dop: (amount: number) => `RD$${amount.toLocaleString("es-DO")}`,
  },
} as const;
