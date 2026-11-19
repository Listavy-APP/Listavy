import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
};

// Source maps are not uploaded: no auth token is configured. The build never depends on Sentry.
export default withSentryConfig(nextConfig, {
  org: "listavy",
  project: "listavy",
  silent: true,
  sourcemaps: { disable: true },
});
