"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Choice } from "@/components/ui/Choice";
import { FilePick } from "@/components/ui/FilePick";
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

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
        avatar: avatarFile ? await resizeImage(avatarFile) : undefined,
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

      <Choice
        legend={es.registration.proTypeLabel}
        name="proType"
        value={proType}
        options={[
          { value: "individual", label: es.registration.individual },
          { value: "company", label: es.registration.company },
        ]}
        onChange={setProType}
      />

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
        preview={false}
        hint={es.registration.idHint}
        buttonLabel={es.common.chooseOne}
        accept="image/*"
        capture="environment"
        files={idFile ? [idFile] : []}
        onFiles={(files) => setIdFile(files[0] ?? null)}
      />

      <FilePick
        label={es.registration.photosLabel}
        hint={es.registration.photosHint}
        buttonLabel={es.common.chooseMany}
        accept="image/*"
        capture="environment"
        multiple
        files={workFiles}
        onFiles={(files) => setWorkFiles(files.slice(0, MAX_WORK_PHOTOS))}
      />

      <FilePick
        label={es.registration.avatarLabel}
        hint={es.registration.avatarHint}
        buttonLabel={es.common.chooseOne}
        accept="image/*"
        capture="environment"
        files={avatarFile ? [avatarFile] : []}
        onFiles={(files) => setAvatarFile(files[0] ?? null)}
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
            preview={false}
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
