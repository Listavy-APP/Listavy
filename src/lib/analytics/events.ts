/**
 * Allowlist of analytics events. Only these names and property keys reach PostHog.
 * Payment data, names, phones, addresses, descriptions, photos, voice notes and
 * location are never sent. Add a key here only after a privacy review.
 */

export type AnalyticsEvent = "page_view";

export interface PageViewProps {
  path: string; // route pattern with ids replaced by ":id", e.g. "/trabajos/:id"
  language: "es" | "en";
  app_version: string;
  device: "mobile" | "desktop";
}

export type AnalyticsProps = PageViewProps;

/** Replaces UUID segments so job, quote and user ids never leave the app. */
export function routePattern(pathname: string): string {
  return pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}
