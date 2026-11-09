"use client";

import { useEffect } from "react";

/** Registers /sw.js in production. Skipped in development to avoid stale caches. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Install support is optional. The app works without it.
    });
  }, []);
  return null;
}
