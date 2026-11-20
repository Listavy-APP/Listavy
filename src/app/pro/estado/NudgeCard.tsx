"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dismissProNudge } from "@/lib/data/proChecklist";
import type { ChecklistItem } from "@/lib/domain/proChecklist";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const FIX_PATH: Partial<Record<ChecklistItem, string>> = {
  verificacion: "/pro/verificacion",
  foto: "/cuenta",
  pago: "/pro/pagos",
  descripcion: "/pro/estado#descripcion",
  horario: "/pro/horario",
};

/** One gentle nudge. Dismissal is stored for the pro, so it stays dismissed on every device. */
export function NudgeCard({ item }: { item: ChecklistItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const message = es.proChecklist.nudge[item];
  const fix = FIX_PATH[item];
  if (hidden || !message) return null;

  async function dismiss() {
    setBusy(true);
    try {
      await dismissProNudge(createSupabaseBrowserClient(), item);
      setHidden(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="panel stack" aria-label={es.proChecklist.nudgeTitle}>
      <strong>{es.proChecklist.nudgeTitle}</strong>
      <p>{message}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {fix ? (
          <Link className="button" href={fix} style={{ minHeight: 44 }}>
            {es.proChecklist.complete}
          </Link>
        ) : null}
        <button className="button secondary" type="button" disabled={busy} onClick={dismiss} style={{ minHeight: 44 }}>
          {es.proChecklist.dismiss}
        </button>
      </div>
    </aside>
  );
}
