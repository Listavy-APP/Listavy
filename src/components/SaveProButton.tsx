"use client";

import Link from "next/link";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Heart toggle for a pro (UI phase §7, item 4). Signed-out visitors go to sign-in.
 * Writes saved_pros under owner-only RLS.
 */
export function SaveProButton({
  userId,
  proId,
  initialSaved,
  next,
}: {
  userId: string | null;
  proId: string;
  initialSaved: boolean;
  next: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userId) {
    return (
      <Link className="button secondary save-pro" href={`/login?next=${encodeURIComponent(next)}`}>
        <span aria-hidden="true">♡</span> {es.saved.save}
      </Link>
    );
  }

  async function toggle() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (saved) {
        const { error: err } = await supabase.from("saved_pros").delete().eq("user_id", userId).eq("pro_id", proId);
        if (err) throw err;
        setSaved(false);
      } else {
        const { error: err } = await supabase.from("saved_pros").insert({ user_id: userId, pro_id: proId });
        if (err) throw err;
        setSaved(true);
      }
    } catch {
      setError(es.saved.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="button secondary save-pro" aria-pressed={saved} disabled={busy} onClick={toggle}>
        <span aria-hidden="true">{saved ? "♥" : "♡"}</span> {saved ? es.saved.saved : es.saved.save}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </>
  );
}
