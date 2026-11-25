"use client";

import { useId, useState } from "react";

/** One open answer at a time. Real buttons with aria-expanded: works by tap and keyboard, no hover. */
export function FaqAccordion({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  return (
    <ul className="faq-list">
      {items.map((item, i) => {
        const expanded = open === i;
        const panelId = `${base}-panel-${i}`;
        return (
          <li key={item.q} className="faq-item">
            <h3 className="faq-q">
              <button
                type="button"
                className="faq-btn"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : i)}
              >
                <span>{item.q}</span>
                <span className="faq-mark" aria-hidden="true">{expanded ? "−" : "+"}</span>
              </button>
            </h3>
            <div id={panelId} className="faq-a" hidden={!expanded}>
              <p>{item.a}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
