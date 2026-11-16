"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolvePhotoReport } from "@/lib/data/trust";
import { esTrust } from "@/lib/i18n/trust";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResolvePhotoReport({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "dismissed" | "upheld") {
    setBusy(true);
    setError(null);
    try {
      await resolvePhotoReport(createSupabaseBrowserClient(), { reportId, decision, note });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        {esTrust.adminPhotos.noteLabel}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="muted">{esTrust.adminPhotos.removalNote}</p>
      <div className="row">
        <button className="button secondary" type="button" disabled={busy || note.trim().length < 10} onClick={() => decide("dismissed")}>
          {esTrust.adminPhotos.dismiss}
        </button>
        <button className="button danger" type="button" disabled={busy || note.trim().length < 10} onClick={() => decide("upheld")}>
          {esTrust.adminPhotos.uphold}
        </button>
      </div>
    </div>
  );
}
