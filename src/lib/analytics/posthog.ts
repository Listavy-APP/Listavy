"use client";

import posthog from "posthog-js";
import type { AnalyticsEvent, AnalyticsProps } from "./events";

/**
 * PostHog Cloud, behavioral analytics only. Off unless NEXT_PUBLIC_POSTHOG_KEY is set.
 * Session replay, autocapture and person profiles are disabled. Only allowlisted
 * events from ./events.ts are sent by the caller.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let ready = false;

export function initAnalytics(): boolean {
  if (ready || typeof window === "undefined" || !KEY) return ready;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "never",
    persistence: "memory",
  });
  ready = true;
  return ready;
}

/** Stops capture for this page load and the stored opt-out. Used when the user turns analytics off. */
export function disableAnalytics(): void {
  if (!ready) return;
  posthog.opt_out_capturing();
}

export function trackEvent(name: AnalyticsEvent, props: AnalyticsProps): void {
  if (!ready) return;
  posthog.capture(name, { ...props });
}
