"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createProApplication, type CompanyInput } from "@/lib/data/pros";
import { SD_ZONES, TRADES, isTrade, isZone } from "@/lib/domain/catalog";
import { es } from "@/lib/i18n/es";
import { resizeImage } from "@/lib/media/resize";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ProType } from "@/lib/types/database";

const MAX_WORK_PHOTOS = 3;
const RNC_PATTERN = /^[0-9]{9}$/;

export function RegistrationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proType, setProType] = useState<ProType>("individual");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [workFiles, setWorkFiles] = useState<File[]>([]);
  const [companyDocFile, setCompanyDocFile] = useState<File | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    const fullName = String(form.get("fullName") ?? "").trim();
    const trade = String(form.get("trade") ?? "");
    const zone = String(form.get("zone") ?? "");
    const priceMin = Number(form.get("priceMin"));
    const priceMax = Number(form.get("priceMax"));
    const razonSocial = String(form.get("razonSocial") ?? "").trim();
    const rnc = String(form.get("rnc") ?? "").trim();

    if (!fullName) return setError(es.registration.needName);
    if (!isTrade(trade)) return setError(es.registration.needTrade);
    if (!isZone(zone)) return setError(es.registration.needZone);
    if (!Number.isInteger(priceMin) || !Number.isInteger(priceMax) || priceMin < 0 || priceMax < priceMin) {
      return setError(es.registration.invalidPrice);
    }
    if (!idFile) return setError(es.registration.needId);
    if (workFiles.length < 1) return setError(es.registration.needPhotos);
    if (workFiles.length > MAX_WORK_PHOTOS) return setError(es.registration.tooManyPhotos);

    if (proType === "company") {
      if (!razonSocial) return setError(es.registration.needRazon);
      if (!RNC_PATTERN.test(rnc)) return setError(es.registration.invalidRnc);
      if (!companyDocFile) return setError(es.registration.needCompanyDoc);
    }

    setBusy(true);
    try {
      // Shrink photos on the phone before upload. Keeps data use low on weak signal.
      const idDocument = await resizeImage(idFile);
      const workPhotos = await Promise.all(workFiles.map((f) => resizeImage(f)));

      let company: CompanyInput | undefined;
      if (proType === "company" && companyDocFile) {
        const isPdf = companyDocFile.type === "application/pdf";
        company = {
          razonSocial,
          rnc,
          // PDFs upload as-is. Images shrink like the other photos.
          document: isPdf ? companyDocFile : await resizeImage(companyDocFile),
          documentType: isPdf ? "application/pdf" : "image/jpeg",
        };
      }

      await createProApplication(createSupabaseBrowserClient(), {
        fullName,
        trade,
        zone,
        priceMinDop: priceMin,
        priceMaxDop: priceMax,
        idDocument,
        workPhotos,
        proType,
        company,
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

      <fieldset className="field">
        <legend>{es.registration.proTypeLabel}</legend>
        <label className="row">
          <input
            type="radio"
            name="proType"
            value="individual"
            checked={proType === "individual"}
            onChange={() => setProType("individual")}
          />
          <span>{es.registration.individual}</span>
        </label>
        <label className="row">
          <input
            type="radio"
            name="proType"
            value="company"
            checked={proType === "company"}
            onChange={() => setProType("company")}
          />
          <span>{es.registration.company}</span>
        </label>
      </fieldset>

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

      {proType === "company" && (
        <fieldset className="stack">
          <legend>{es.registration.companyTitle}</legend>

          <label className="field">
            <span>{es.registration.razonSocial}</span>
            <input name="razonSocial" required />
          </label>

          <label className="field">
            <span>{es.registration.rnc}</span>
            <input name="rnc" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required />
          </label>
          <p className="muted">{es.registration.rncHint}</p>

          <label className="field">
            <span>{es.registration.companyDocLabel}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setCompanyDocFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="muted">{es.registration.companyDocHint}</p>
        </fieldset>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <button className="button" type="submit" disabled={busy}>
        {busy ? es.registration.submitting : es.registration.submit}
      </button>
    </form>
  );
}
