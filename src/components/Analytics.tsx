"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackEvent, initAnalytics } from "@/lib/analytics/posthog";
import { getAnalyticsConsent } from "@/lib/analytics/consent";
import { routePattern, type PageViewProps } from "@/lib/analytics/events";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** Sends one page_view per route change. Props follow the allowlist in events.ts. */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!getAnalyticsConsent() || !initAnalytics()) return;
    const props: PageViewProps = {
      path: routePattern(pathname),
      language: navigator.language.toLowerCase().startsWith("en") ? "en" : "es",
      app_version: APP_VERSION,
      device: window.matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop",
    };
    trackEvent("page_view", props);
  }, [pathname]);

  return null;
}
