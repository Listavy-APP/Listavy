"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { setMyFixedServices } from "@/lib/data/fixed";
import type { FixedServiceRow } from "@/lib/domain/fixed-service";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Opt-in checklist for the fixed-price services of the pro's trade (0116). Saves through pro_set_fixed_services. */
export function FixedServicesForm({ catalog, initial }: { catalog: FixedServiceRow[]; initial: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSaved(false);
    setPicked((cur) => (cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await setMyFixedServices(createSupabaseBrowserClient(), picked);
      setSaved(true);
      router.refresh();
    } catch {
      setError(es.fixed.estado.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="precios-fijos" className="stack" onSubmit={onSubmit} noValidate>
      <h2>{es.fixed.estado.title}</h2>
      <p className="muted">{es.fixed.estado.intro}</p>
      {catalog.length === 0 ? (
        <p className="muted">{es.fixed.estado.empty}</p>
      ) : (
        catalog.map((s) => (
          <label key={s.id} className="panel" style={{ display: "flex", gap: 12, alignItems: "flex-start", minHeight: 44 }}>
            <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} disabled={busy} style={{ marginTop: 4 }} />
            <span className="stack">
              <b>
                {s.name_es} · {es.money.dop(s.price_dop)}
              </b>
              <span className="muted">
                {es.fixed.includesLabel}: {s.includes_es}
              </span>
            </span>
          </label>
        ))
      )}
      {catalog.length > 0 ? (
        <button className="button" type="submit" disabled={busy}>
          {es.fixed.estado.save}
        </button>
      ) : null}
      {saved ? <p className="ok" role="status">{es.fixed.estado.saved}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
