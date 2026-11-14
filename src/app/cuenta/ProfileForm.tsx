"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { CityZoneSelect } from "@/components/CityZoneSelect";
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
      setError(es.profile.needNameZone);
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
      <CityZoneSelect
        cityName="city"
        zoneName="zone"
        zoneLabel={es.profile.zoneLabel}
        defaultZone={zone || undefined}
        placeholder
        onChange={(_, z) => setZone(z)}
      />
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.profile.saving : es.profile.save}
      </button>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
