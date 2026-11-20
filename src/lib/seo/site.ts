/** Site-wide SEO constants and the route lists that robots, the sitemap, and tests share. */

export const SITE_URL = "https://listavy.com";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** Public routes that belong in the sitemap. Pro profiles and service pages are added from data. */
export const PUBLIC_STATIC_PATHS = [
  "/",
  "/buscar",
  "/precios",
  "/acerca",
  "/ayuda",
  "/legal",
  "/terminos",
  "/privacidad",
  "/cookies",
  "/cancelacion",
  "/comunidad",
] as const;

/** Private areas. Never in the sitemap. robots.txt disallows each one. */
export const PRIVATE_PATHS = [
  "/admin",
  "/ajustes",
  "/cuenta",
  "/login",
  "/notificaciones",
  "/pedir",
  "/seguridad-admin",
  "/trabajos",
  "/ayuda/tickets",
  "/pro/estado",
  "/pro/horario",
  "/pro/pagos",
  "/pro/registro",
  "/pro/plantillas",
  "/pro/solicitudes",
  "/pro/verificacion",
] as const;

/** Trade views: slug in the URL and the trade key in the database. */
export const TRADE_VIEWS = [
  { slug: "plomeria", trade: "plumber" },
  { slug: "electricidad", trade: "electrician" },
  { slug: "aire-acondicionado", trade: "ac_technician" },
  { slug: "pintura", trade: "painter" },
  { slug: "cerrajeria", trade: "locksmith" },
  { slug: "carpinteria", trade: "carpenter" },
  { slug: "herreria", trade: "blacksmith" },
] as const;

export function tradeViewPath(slug: string): string {
  return `/servicios/${slug}`;
}
