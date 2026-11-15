"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Marks a check-in problem resolved (admin RPC, audited). */
export function ResolveCheckinButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resolve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createSupabaseBrowserClient().rpc("admin_resolve_checkin_problem", { p_notification: id });
    setBusy(false);
    if (err) return setError("No se pudo marcar como resuelto.");
    router.refresh();
  }
  return (
    <>
      <button className="button" type="button" onClick={resolve} disabled={busy}>Marcar como resuelto</button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
