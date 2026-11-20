import type { Metadata } from "next";
import { absoluteUrl } from "./site.ts";

/** Brand image for cards and link previews. 1200×630, generated from the brand lockup. */
export const DEFAULT_OG_IMAGE = "/opengraph-image.png";

export function pageMetadata(opts: { title: string; description: string; path: string; image?: string }): Metadata {
  const image = opts.image ?? DEFAULT_OG_IMAGE;
  return {
    // Copy already ends with "| Listavy". absolute skips the root title template.
    title: { absolute: opts.title },
    description: opts.description,
    alternates: { canonical: absoluteUrl(opts.path) },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: absoluteUrl(opts.path),
      siteName: "Listavy",
      locale: "es_DO",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: "Listavy" }],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  };
}

/** JSON-LD for a script tag. Escapes "<" so no value can close the script element. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
