"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createProApplication } from "@/lib/data/pros";
import { SD_ZONES, TRADES, isTrade, isZone } from "@/lib/domain/catalog";
import { es } from "@/lib/i18n/es";
import { resizeImage } from "@/lib/media/resize";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAX_WORK_PHOTOS = 3;

export function RegistrationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [workFiles, setWorkFiles] = useState<File[]>([]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    const fullName = String(form.get("fullName") ?? "").trim();
    const trade = String(form.get("trade") ?? "");
    const zone = String(form.get("zone") ?? "");
    const priceMin = Number(form.get("priceMin"));
    const priceMax = Number(form.get("priceMax"));

    if (!fullName) return setError(es.registration.needName);
    if (!isTrade(trade)) return setError(es.registration.needTrade);
    if (!isZone(zone)) return setError(es.registration.needZone);
    if (!Number.isInteger(priceMin) || !Number.isInteger(priceMax) || priceMin < 0 || priceMax < priceMin) {
      return setError(es.registration.invalidPrice);
    }
    if (!idFile) return setError(es.registration.needId);
    if (workFiles.length < 1) return setError(es.registration.needPhotos);
    if (workFiles.length > MAX_WORK_PHOTOS) return setError(es.registration.tooManyPhotos);

    setBusy(true);
    try {
      // Shrink photos on the phone before upload. Keeps data use low on weak signal.
      const idDocument = await resizeImage(idFile);
      const workPhotos = await Promise.all(workFiles.map((f) => resizeImage(f)));
      await createProApplication(createSupabaseBrowserClient(), {
        fullName,
        trade,
        zone,
        priceMinDop: priceMin,
        priceMaxDop: priceMax,
        idDocument,
        workPhotos,
      });
      router.push("/pro/estado");
      router.refresh();
    } catch {
      setError(es.registration.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h1>{es.registration.title}</h1>
      <p className="lead">{es.registration.intro}</p>

      <label className="field">
        <span>{es.registration.name}</span>
        <input name="fullName" autoComplete="name" required />
      </label>

      <label className="field">
        <span>{es.registration.trade}</span>
        <select name="trade" required defaultValue="">
          <option value="" disabled>—</option>
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {es.trades[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>{es.registration.zone}</span>
        <select name="zone" required defaultValue="">
          <option value="" disabled>—</option>
          {SD_ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <label className="field">
          <span>{es.registration.priceMin}</span>
          <input name="priceMin" type="number" inputMode="numeric" min={0} step={1} required />
        </label>
        <label className="field">
          <span>{es.registration.priceMax}</span>
          <input name="priceMax" type="number" inputMode="numeric" min={0} step={1} required />
        </label>
      </div>
      <p className="muted">{es.registration.priceHint}</p>

      <label className="field">
        <span>{es.registration.idLabel}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <p className="muted">{es.registration.idHint}</p>

      <label className="field">
        <span>{es.registration.photosLabel}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => setWorkFiles(Array.from(e.target.files ?? []).slice(0, MAX_WORK_PHOTOS))}
        />
      </label>
      <p className="muted">{es.registration.photosHint}</p>

      {error && <p className="error" role="alert">{error}</p>}

      <button className="button" type="submit" disabled={busy}>
        {busy ? es.registration.submitting : es.registration.submit}
      </button>
    </form>
  );
}
