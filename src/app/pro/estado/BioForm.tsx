"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAX = 500;

/** The pro's public bio. Owner-only update through RLS; the guard does not cover bio. */
export function BioForm({ proId, initial }: { proId: string; initial: string | null }) {
  const router = useRouter();
  const [bio, setBio] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createSupabaseBrowserClient();
      const value = bio.trim();
      const { error: err } = await supabase
        .from("pros")
        .update({ bio: value.length > 0 ? value : null })
        .eq("id", proId);
      if (err) throw err;
      setSaved(true);
      router.refresh();
    } catch {
      setError(es.proBioForm.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h2>{es.proBioForm.title}</h2>
      <label className="field">
        {es.proBioForm.label}
        <textarea rows={5} maxLength={MAX} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      <span className="muted">{bio.length}/{MAX}</span>
      <button className="button" type="submit" disabled={busy}>
        {es.proBioForm.save}
      </button>
      {saved ? <p className="ok">{es.proBioForm.saved}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
