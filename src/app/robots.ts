import type { MetadataRoute } from "next";
import { absoluteUrl, PRIVATE_PATHS } from "@/lib/seo/site";

/** Preview and other non-production deployments disallow everything. Production lists the private areas. */
export default function robots(): MetadataRoute.Robots {
  const env = process.env.VERCEL_ENV;
  if (env && env !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
