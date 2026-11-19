import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { scrubDeep, scrubText, scrubUrl } from "./scrub";

/**
 * Shared Sentry settings for the browser, server and edge runtimes.
 * Privacy rules (hard requirement):
 *  - sendDefaultPii is false. No IPs, users, cookies or headers.
 *  - No session replay. No performance tracing (free plan quota).
 *  - Emails and phone numbers are redacted from every string in an event.
 *  - Query strings are removed from URLs.
 *  - UI, console and DOM breadcrumbs are dropped, because they can capture typed text.
 *  - fetch and XHR breadcrumbs keep the URL path and status, never bodies.
 */

// Public ingest DSN. Not a secret: it only allows sending events to this project.
export const SENTRY_DSN =
  "https://78f477bf267f4985528eb6d5b168b230@o4512453740462080.ingest.us.sentry.io/4512453795643393";

const DROPPED_BREADCRUMB_PREFIXES = ["ui.", "console", "dom."];

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const category = crumb.category ?? "";
  if (DROPPED_BREADCRUMB_PREFIXES.some((p) => category === p || category.startsWith(p))) {
    return null;
  }
  const data = crumb.data ? { ...crumb.data } : undefined;
  if (data) {
    delete data.body;
    delete data.request_body;
    delete data.response_body;
    if (typeof data.url === "string") data.url = scrubUrl(data.url);
  }
  return {
    ...crumb,
    message: crumb.message ? scrubText(crumb.message) : crumb.message,
    data: data ? scrubDeep(data) : undefined,
  };
}

function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete event.user;
  delete event.extra;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
  }
  if (event.contexts) {
    // Keep runtime, OS and browser facts. Drop everything else.
    const keep = new Set(["runtime", "os", "browser", "device"]);
    for (const key of Object.keys(event.contexts)) {
      if (!keep.has(key)) delete event.contexts[key];
    }
  }
  if (event.message) event.message = scrubText(event.message);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubText(ex.value);
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((c): c is Breadcrumb => c !== null);
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  return event;
}

export function buildSentryOptions() {
  return {
    dsn: SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    enabled: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "preview",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  };
}
