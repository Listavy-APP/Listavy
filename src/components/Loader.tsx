"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "listavy-intro-seen";
// The bounce is 0.08s delay + 0.88s animation = 0.96s. Stay up for the full bounce.
const MIN_MS = 980;
// Hard cap, even if the page is slow to load.
const MAX_MS = 1200;

/**
 * Brand loader: only the real favicon animating (springy bounce + wobble). No text.
 * Shows on the first load of a browser session (cold start, first visit, PWA launch), not on in-app navigation.
 * Stays until the bounce finishes (MIN_MS) and the page has loaded, capped at MAX_MS. A tap skips it.
 * Reduced motion: never shown.
 */
export function Loader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked: show the loader once per page load.
    }
    const start = performance.now();
    setVisible(true);

    const timers: number[] = [];
    const finish = () => setVisible(false);

    // Dismiss once the bounce has played, but never after MAX_MS.
    const dismissAfterBounce = () => {
      const wait = Math.max(0, MIN_MS - (performance.now() - start));
      timers.push(window.setTimeout(finish, wait));
    };

    timers.push(window.setTimeout(finish, MAX_MS));
    if (document.readyState === "complete") dismissAfterBounce();
    else window.addEventListener("load", dismissAfterBounce, { once: true });

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("load", dismissAfterBounce);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="loader" onClick={() => setVisible(false)} role="presentation">
      {/* Real favicon file. No letters, no text. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="loader-mark" src="/icon-512.png" alt="" width={96} height={96} />
    </div>
  );
}
