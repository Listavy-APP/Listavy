import type { MetadataRoute } from "next";
import { es } from "@/lib/i18n/es";

/** Web app manifest. Makes the PWA installable on iOS and Android from one codebase. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: es.brand,
    short_name: es.brand,
    description: es.home.subtitle,
    lang: "es-DO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f5c4d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
