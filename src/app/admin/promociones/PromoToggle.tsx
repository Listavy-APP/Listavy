"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPromoActive } from "@/lib/data/promo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await setPromoActive(createSupabaseBrowserClient(), id, !active);
      router.refresh();
    } catch (err) {
      setError(es.promo.admin.toggleFailed + (err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button className="button secondary" type="button" disabled={busy} onClick={toggle}>
        {active ? es.promo.admin.deactivate : es.promo.admin.activate}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
