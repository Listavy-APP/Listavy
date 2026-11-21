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

/** Trade views come from the trades catalog (migration 0109): one view per active trade, slug in the URL. */
export type TradeViewSlug = { slug: string };

export function tradeViewPath(slug: string): string {
  return `/servicios/${slug}`;
}
