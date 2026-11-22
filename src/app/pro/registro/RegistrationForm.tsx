"use client";

import { ClaimReferral } from "@/components/ClaimReferral";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Choice } from "@/components/ui/Choice";
import { FilePick } from "@/components/ui/FilePick";
import { createProApplication, type CompanyInput } from "@/lib/data/pros";
import { recordLegalAcceptance } from "@/lib/data/legal";
import { AcceptLegal } from "@/components/AcceptLegal";
import type { CatalogTrade } from "@/lib/data/trades";
import { MunicipalityPicker } from "@/components/MunicipalityPicker";
import type { Municipality } from "@/lib/data/municipalities";
import { ZONES_BY_CITY, CITIES } from "@/lib/domain/catalog";
import { isPriceUnit } from "@/lib/domain/price-unit";
import { es } from "@/lib/i18n/es";
import { resizeImage } from "@/lib/media/resize";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ProType } from "@/lib/types/database";

const MAX_WORK_PHOTOS = 3;
const RNC_PATTERN = /^[0-9]{9}$/;

export function RegistrationForm({ trades, municipalities }: { trades: CatalogTrade[]; municipalities: Municipality[] }) {
  const [municipalityId, setMunicipalityId] = useState("");
  const sectorSuggestions = CITIES.flatMap((c) => ZONES_BY_CITY[c] as readonly string[]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proType, setProType] = useState<ProType>("individual");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [workFiles, setWorkFiles] = useState<File[]>([]);
  const [companyDocFile, setCompanyDocFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    const fullName = String(form.get("fullName") ?? "").trim();
    const trade = String(form.get("trade") ?? "");
    const zone = String(form.get("zone") ?? "");
    const priceMin = Number(form.get("priceMin"));
    const priceMax = Number(form.get("priceMax"));
    const unitRaw = String(form.get("priceUnit") ?? "");
    const razonSocial = String(form.get("razonSocial") ?? "").trim();
    const rnc = String(form.get("rnc") ?? "").trim();
    const customLine = String(form.get("customLine") ?? "").trim();

    if (!fullName) return setError(es.registration.needName);
    if (!trades.some((t) => t.key === trade)) return setError(es.registration.needTrade);
    if (!municipalityId) return setError("Elige tu municipio.");
    if (zone.length < 2 || zone.length > 60) return setError(es.registration.needZone);
    if (!Number.isInteger(priceMin) || !Number.isInteger(priceMax) || priceMin < 0 || priceMax < priceMin) {
      return setError(es.registration.invalidPrice);
    }
    if (!isPriceUnit(unitRaw)) return setError(es.priceUnit.needUnit);
    if (!idFile) return setError(es.registration.needId);
    if (workFiles.length < 1) return setError(es.registration.needPhotos);
    if (workFiles.length > MAX_WORK_PHOTOS) return setError(es.registration.tooManyPhotos);

    if (proType === "company") {
      if (!razonSocial) return setError(es.registration.needRazon);
      if (!RNC_PATTERN.test(rnc)) return setError(es.registration.invalidRnc);
      if (!companyDocFile) return setError(es.registration.needCompanyDoc);
    }
    if (!accepted) return setError(es.legal.acceptRequired);

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

      const supabase = createSupabaseBrowserClient();
      // Recorded before the application is sent. If this fails, no application is created.
      await recordLegalAcceptance(supabase, ["pro_terms", "community"]);
      await createProApplication(supabase, {
        fullName,
        trade,
        zone,
        municipalityId,
        priceMinDop: priceMin,
        priceMaxDop: priceMax,
        priceUnit: unitRaw,
        idDocument,
        workPhotos,
        proType,
        company,
        customLine: proType === "company" && customLine ? customLine : undefined,
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
      <ClaimReferral track="pro" />
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
          {trades.map((t) => (
            <option key={t.key} value={t.key}>
              {t.proLabel}
            </option>
          ))}
        </select>
      </label>

      <MunicipalityPicker
        municipalities={municipalities}
        value={municipalityId}
        onChange={setMunicipalityId}
        label="Municipio"
        required
      />

      <label className="field">
        <span>{es.registration.zone}</span>
        <input name="zone" list="sector-suggestions" required minLength={2} maxLength={60} style={{ minHeight: 44 }} />
        <datalist id="sector-suggestions">
          {sectorSuggestions.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
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
        <span>{es.priceUnit.label}</span>
        <select name="priceUnit" defaultValue="job" required>
          <option value="job">{es.priceUnit.job}</option>
          <option value="hour">{es.priceUnit.hour}</option>
          <option value="visit">{es.priceUnit.visit}</option>
        </select>
      </label>

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

          <label className="field">
            <span>{es.registration.customLine}</span>
            <input name="customLine" maxLength={80} />
          </label>
          <p className="muted">{es.registration.customLineHint}</p>

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

      <AcceptLegal kind="pro" checked={accepted} disabled={busy} onChange={setAccepted} />
      {error && <p className="error" role="alert">{error}</p>}

      <button className="button" type="submit" disabled={busy}>
        {busy ? es.registration.submitting : es.registration.submit}
      </button>
    </form>
  );
}
