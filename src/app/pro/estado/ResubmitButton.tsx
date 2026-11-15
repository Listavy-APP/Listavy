"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

/** Pro fixes the profile and resubmits. 0071 allows only rejected -> pending with the reason cleared. */
export function ResubmitButton({ proId }: { proId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const { error: err } = await createSupabaseBrowserClient()
      .from("pros")
      .update({ verification_status: "pending", rejection_reason: null })
      .eq("id", proId);
    setBusy(false);
    if (err) return setError(es.adminPending.fail);
    router.refresh();
  }

  return (
    <div className="stack">
      <button className="button" type="button" onClick={onClick} disabled={busy}>
        {es.proStatus.resubmit}
      </button>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
