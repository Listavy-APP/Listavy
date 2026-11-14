"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Marks a pro report resolved via resolve_pro_report() (SECURITY DEFINER, admin only). */
export function ResolveReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.rpc("resolve_pro_report", { p_report: reportId });
    setBusy(false);
    if (err) {
      setError(es.admin.resolveFailed);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button className="button secondary" type="button" onClick={resolve} disabled={busy}>
        {es.admin.resolve}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
