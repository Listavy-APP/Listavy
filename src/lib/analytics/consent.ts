"use client";

import { disableAnalytics, initAnalytics } from "./posthog";

/**
 * Analytics consent is per device and off by default (opt-in).
 * The choice is stored in localStorage. It does not reach the database.
 */
const KEY = "listavy:analytics";

export function getAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(allowed: boolean): void {
  try {
    window.localStorage.setItem(KEY, allowed ? "on" : "off");
  } catch {
    // Storage unavailable (private mode): consent cannot be saved, so analytics stays off.
    allowed = false;
  }
  if (allowed) initAnalytics();
  else disableAnalytics();
}
