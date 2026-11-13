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
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
