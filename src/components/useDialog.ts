"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal behavior for sheets and confirmation dialogs.
 * While `open`: focus moves into the dialog, Tab stays inside it, Escape calls `onClose`,
 * and focus returns to the element that had it before the dialog opened.
 * `onClose` decides whether closing is allowed (for example, not while a request is busy).
 */
export function useDialog(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  // Last element focused outside the dialog. Recorded before opening, so it is the trigger even when
  // the dialog's own autofocus moves focus during the same commit.
  const lastOutside = useRef<HTMLElement | null>(null);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (open) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      // Ignore focus inside any dialog: autofocus can land there before this listener is removed.
      if (target instanceof HTMLElement && !target.closest('[role="dialog"], [role="alertdialog"]')) lastOutside.current = target;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = lastOutside.current;
    const container = containerRef.current;
    const focusables = () =>
      container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement) : [];

    const initial = container?.querySelector<HTMLElement>("[autofocus]") ?? focusables()[0] ?? container;
    initial?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);
      if (e.shiftKey && (!inside || active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [open, containerRef]);
}
