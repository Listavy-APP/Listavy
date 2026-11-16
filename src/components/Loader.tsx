"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "listavy-intro-seen";
const MAX_MS = 1200;

/**
 * Brand loader: only the real favicon animating (springy bounce + wobble). No text.
 * Shows on the first load of a browser session (cold start, first visit, PWA launch), not on in-app navigation.
 * Hides when the page loads or after 1.2s, whichever comes first. A tap skips it.
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
    setVisible(true);
    const hide = () => setVisible(false);
    const timer = window.setTimeout(hide, MAX_MS);
    if (document.readyState === "complete") hide();
    window.addEventListener("load", hide, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", hide);
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
