"use client";

import { useEffect } from "react";

/**
 * Scrolls to `#id` once the target exists. Server-rendered content can arrive after
 * the browser has already tried the anchor, so this waits for the element to appear.
 * Gives up after a few seconds. Respects reduced motion.
 */
export function HashScroll({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;

    let done = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scrollTo = (el: HTMLElement) => {
      if (done) return;
      done = true;
      el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      observer.disconnect();
      clearTimeout(timer);
    };

    const find = () => {
      const el = document.getElementById(id);
      if (el) scrollTo(el);
      return el;
    };

    const observer = new MutationObserver(() => find());
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      done = true;
      observer.disconnect();
    }, 5000);

    if (!find()) {
      // Wait for layout (images, fonts) to settle, then try once more.
      window.addEventListener("load", find, { once: true });
    }

    return () => {
      done = true;
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [id]);

  return null;
}
