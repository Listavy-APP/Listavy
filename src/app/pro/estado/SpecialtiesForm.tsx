"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { es } from "@/lib/i18n/es";
import { setMySpecialties } from "@/lib/data/pros";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAX = 12;

/** The pro's folded specialties, chosen from the catalog list for their trade (0110). */
export function SpecialtiesForm({ initial, options }: { initial: string[]; options: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setSaved(false);
    setPicked((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : cur.length >= MAX ? cur : [...cur, value]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await setMySpecialties(createSupabaseBrowserClient(), picked);
      setSaved(true);
      router.refresh();
    } catch {
      setError(es.proSpecialtiesForm.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h2>{es.proSpecialtiesForm.title}</h2>
      <p className="muted">{es.proSpecialtiesForm.hint}</p>
      <fieldset className="stack">
        <legend className="muted">{picked.length}/{MAX}</legend>
        {options.map((o) => (
          <label key={o} className="row" style={{ minHeight: 44, alignItems: "center" }}>
            <input type="checkbox" checked={picked.includes(o)} onChange={() => toggle(o)} />
            {o}
          </label>
        ))}
      </fieldset>
      <button className="button" type="submit" disabled={busy} style={{ minHeight: 44 }}>
        {es.proSpecialtiesForm.save}
      </button>
      {saved ? <p className="ok" role="status">{es.proSpecialtiesForm.saved}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
