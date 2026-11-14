"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "@/components/Switch";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Pro's own availability switch (UI phase §7, item 6). Owner-only update through RLS. */
export function AvailabilityToggle({ proId, initial }: { proId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.from("pros").update({ available: next }).eq("id", proId);
      if (err) throw err;
      setOn(next);
      router.refresh();
    } catch {
      setError(es.availability.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="settings-row">
        <span>{es.availability.label}</span>
        <Switch checked={on} onChange={change} label={es.availability.label} disabled={busy} />
      </div>
      <p className="muted">{es.availability.hint}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
