"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { esViewAs } from "@/lib/i18n/view-as";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Enters the read-only preview for one user. The RPC writes one audit row, then the page opens.
 * Shown only to super admins by the caller. The server rejects anyone else.
 */
export function ViewAsButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: rpcError } = await supabase.rpc("admin_view_as_enter", { p_target: userId });
    if (rpcError) {
      setError(esViewAs.startError);
      setBusy(false);
      return;
    }
    router.push(`/admin/ver-como/${userId}`);
  }

  return (
    <div className="stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="button secondary" type="button" disabled={busy} onClick={start}>
        {esViewAs.start}
      </button>
    </div>
  );
}
