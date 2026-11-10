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

/** Styled file picker: a navy-outline button, the chosen file names below it. */
function FilePick(props: {
  label: string;
  hint: string;
  buttonLabel: string;
  accept: string;
  capture?: "environment";
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const names = props.files.map((f) => f.name).join(", ");
  return (
    <div className="file">
      <span className="field-label">{props.label}</span>
      <label className="file-pick">
        <input
          className="sr-only"
          type="file"
          accept={props.accept}
          capture={props.capture}
          multiple={props.multiple}
          onChange={(e) => props.onFiles(Array.from(e.target.files ?? []))}
        />
        <span>{props.buttonLabel}</span>
      </label>
      <span className="file-name">{names || es.registration.noFile}</span>
      <p className="muted">{props.hint}</p>
    </div>
  );
}

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

      <fieldset>
        <legend>{es.registration.proTypeLabel}</legend>
        <div className="choice-group">
          {(["individual", "company"] as const).map((value) => (
            <label key={value} className={`choice${proType === value ? " on" : ""}`}>
              <input
                className="sr-only"
                type="radio"
                name="proType"
                value={value}
                checked={proType === value}
                onChange={() => setProType(value)}
              />
              <span className="choice-mark" aria-hidden="true" />
              <span>{value === "individual" ? es.registration.individual : es.registration.company}</span>
            </label>
          ))}
        </div>
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

      <FilePick
        label={es.registration.idLabel}
        hint={es.registration.idHint}
        buttonLabel={es.registration.chooseOne}
        accept="image/*"
        capture="environment"
        files={idFile ? [idFile] : []}
        onFiles={(files) => setIdFile(files[0] ?? null)}
      />

      <FilePick
        label={es.registration.photosLabel}
        hint={es.registration.photosHint}
        buttonLabel={es.registration.chooseMany}
        accept="image/*"
        capture="environment"
        multiple
        files={workFiles}
        onFiles={(files) => setWorkFiles(files.slice(0, MAX_WORK_PHOTOS))}
      />

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

          <FilePick
            label={es.registration.companyDocLabel}
            hint={es.registration.companyDocHint}
            buttonLabel={es.registration.chooseDoc}
            accept="image/*,application/pdf"
            files={companyDocFile ? [companyDocFile] : []}
            onFiles={(files) => setCompanyDocFile(files[0] ?? null)}
          />
        </fieldset>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <button className="button" type="submit" disabled={busy}>
        {busy ? es.registration.submitting : es.registration.submit}
      </button>
    </form>
  );
}
