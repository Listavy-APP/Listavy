"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createPromoCode } from "@/lib/data/promo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";

/** Dates are Santo Domingo days (UTC-4, no daylight saving). Start is the first instant of the day, end the last. */
const startOf = (d: string) => (d ? `${d}T00:00:00-04:00` : null);
const endOf = (d: string) => (d ? `${d}T23:59:59-04:00` : null);

export function PromoForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createPromoCode(createSupabaseBrowserClient(), {
        code: code.trim(),
        kind,
        value: Number(value),
        startsAt: startOf(startsOn),
        expiresAt: endOf(expiresOn),
        maxRedemptions: maxUses.trim() ? Number(maxUses) : null,
        note: note.trim() || null,
      });
      setCode("");
      setValue("");
      setStartsOn("");
      setExpiresOn("");
      setMaxUses("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(es.promo.admin.createFailed + (err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <h2>{es.promo.admin.createTitle}</h2>
      <label className="field">
        <span>{es.promo.admin.code}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="characters" autoComplete="off" />
      </label>
      <label className="field">
        <span>{es.promo.admin.kind}</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}>
          <option value="percent">{es.promo.admin.kindPercent}</option>
          <option value="fixed">{es.promo.admin.kindFixed}</option>
        </select>
      </label>
      <label className="field">
        <span>{es.promo.admin.value}</span>
        <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} required />
      </label>
      <label className="field">
        <span>{es.promo.admin.startsAt}</span>
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </label>
      <label className="field">
        <span>{es.promo.admin.expiresAt}</span>
        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      </label>
      <label className="field">
        <span>{es.promo.admin.maxRedemptions}</span>
        <input inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
      </label>
      <label className="field">
        <span>{es.promo.admin.note}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="button" type="submit" disabled={busy || !code.trim() || !value}>
        {busy ? es.promo.admin.saving : es.promo.admin.save}
      </button>
    </form>
  );
}
