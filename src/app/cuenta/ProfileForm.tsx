"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { SD_ZONES } from "@/lib/domain/catalog";
import { updateCustomerProfile } from "@/lib/data/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ProfileForm(props: { userId: string; fullName: string | null; zone: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(props.fullName ?? "");
  const [zone, setZone] = useState(props.zone ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!name.trim() || !zone) {
      setError("Escribe tu nombre y elige tu zona.");
      return;
    }
    setBusy(true);
    try {
      await updateCustomerProfile(createSupabaseBrowserClient(), props.userId, {
        full_name: name,
        zone,
      });
      setMessage(es.profile.saved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label className="field">
        {es.profile.nameLabel}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
      </label>
      <label className="field">
        {es.profile.zoneLabel}
        <select value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">—</option>
          {SD_ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.profile.saving : es.profile.save}
      </button>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
