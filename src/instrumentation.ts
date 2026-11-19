import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "@/lib/observability/sentry-options";

/** Server and edge error reporting. Runs once per server start. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(buildSentryOptions());
  }
}

/** Reports server render and request errors. Only the error and the route reach Sentry. */
export const onRequestError = Sentry.captureRequestError;
