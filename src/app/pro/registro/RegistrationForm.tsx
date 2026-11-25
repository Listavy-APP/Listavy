"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AcceptLegal } from "@/components/AcceptLegal";
import { ClaimReferral } from "@/components/ClaimReferral";
import { MunicipalityPicker } from "@/components/MunicipalityPicker";
import { Choice } from "@/components/ui/Choice";
import { FilePick } from "@/components/ui/FilePick";
import { WizardBar, WizardHeader } from "@/components/ui/Wizard";
import { recordLegalAcceptance } from "@/lib/data/legal";
import type { Municipality } from "@/lib/data/municipalities";
import { createProApplication, type CompanyInput } from "@/lib/data/pros";
import type { CatalogTrade } from "@/lib/data/trades";
import { submitVerification } from "@/lib/data/verification";
import { ZONES_BY_CITY, CITIES } from "@/lib/domain/catalog";
import { isPriceUnit } from "@/lib/domain/price-unit";
import {
  BUENA_CONDUCTA_MAX_AGE_DAYS,
  DOCUMENT_CONSENT_VERSION,
  buenaConductaWindowOk,
  needsExpiryInput,
  needsIssueInput,
  stagesFor,
  type Stage,
} from "@/lib/domain/verification";
import { es } from "@/lib/i18n/es";
import { esVerification as tv } from "@/lib/i18n/verification";
import { resizeImage } from "@/lib/media/resize";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ProType } from "@/lib/types/database";

const MAX_WORK_PHOTOS = 3;
const RNC_PATTERN = /^[0-9]{9}$/;
const DOC_ACCEPT = "image/*,application/pdf";
const TOTAL_STEPS = 5;

type DocUpload = { stage: Stage; file: File; issueDate: string | null; expiresAt: string | null };

/** Images go through the same resize as the other photos. PDFs upload as-is. */
async function toUpload(file: File): Promise<{ blob: Blob; contentType: "image/jpeg" | "application/pdf" }> {
  if (file.type === "application/pdf") return { blob: file, contentType: "application/pdf" };
  return { blob: await resizeImage(file), contentType: "image/jpeg" };
}

/**
 * Pro application as a 5-step wizard. Presentation only: the createProApplication payload is unchanged,
 * and verification documents still upload after the application succeeds (best-effort).
 * All steps share one state, so going back never loses entered data or chosen files.
 */
export function RegistrationForm({ trades, municipalities }: { trades: CatalogTrade[]; municipalities: Municipality[] }) {
  const router = useRouter();
  const sectorSuggestions = CITIES.flatMap((c) => ZONES_BY_CITY[c] as readonly string[]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [proType, setProType] = useState<ProType>("individual");
  const [trade, setTrade] = useState("");
  const [municipalityId, setMunicipalityId] = useState("");
  const [zone, setZone] = useState("");
  // Step 2
  const [fullName, setFullName] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [rnc, setRnc] = useState("");
  const [customLine, setCustomLine] = useState("");
  // Step 3
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceUnit, setPriceUnit] = useState("job");
  // Step 4
  const [idFile, setIdFile] = useState<File | null>(null);
  const [workFiles, setWorkFiles] = useState<File[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [companyDocFile, setCompanyDocFile] = useState<File | null>(null);
  // Step 5 (individual verification documents)
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [buenaFile, setBuenaFile] = useState<File | null>(null);
  const [buenaIssue, setBuenaIssue] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certExpiry, setCertExpiry] = useState("");
  const [diplomaFile, setDiplomaFile] = useState<File | null>(null);
  const [insFile, setInsFile] = useState<File | null>(null);
  const [insExpiry, setInsExpiry] = useState("");
  const [docsConsent, setDocsConsent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [partialFailures, setPartialFailures] = useState<string[] | null>(null);

  // Electricians: SIE licence. Others: INFOTEP certificate.
  const certStage: Stage | null = trade
    ? (stagesFor("individual", trade).find((x) => x === "sie_licence" || x === "infotep_certificate") ?? null)
    : null;
  const isCompany = proType === "company";

  // Each step's gate. The same checks the form ran on submit, moved to the step they belong to.
  function stepError(n: number): string | null {
    if (n === 1) {
      if (!trades.some((t) => t.key === trade)) return es.registration.needTrade;
      if (!municipalityId) return es.registration.needMunicipality;
      const z = zone.trim();
      if (z.length < 2 || z.length > 60) return es.registration.needZone;
    }
    if (n === 2) {
      if (!fullName.trim()) return isCompany ? es.registration.needRepresentativeName : es.registration.needName;
      if (isCompany) {
        if (!razonSocial.trim()) return es.registration.needRazon;
        if (!RNC_PATTERN.test(rnc.trim())) return es.registration.invalidRnc;
      }
    }
    if (n === 3) {
      const min = Number(priceMin);
      const max = Number(priceMax);
      if (priceMin === "" || priceMax === "" || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
        return es.registration.invalidPrice;
      }
      if (!isPriceUnit(priceUnit)) return es.priceUnit.needUnit;
    }
    if (n === 4) {
      if (!idFile) return es.registration.needId;
      if (workFiles.length < 1) return es.registration.needPhotos;
      if (workFiles.length > MAX_WORK_PHOTOS) return es.registration.tooManyPhotos;
      if (isCompany && !companyDocFile) return es.registration.needCompanyDoc;
    }
    if (n === 5) {
      if (!isCompany) {
        const today = new Date().toISOString().slice(0, 10);
        if (!selfieFile) return es.registration.needSelfie;
        if (buenaFile && !buenaIssue) return tv.form.missingDate;
        if (buenaFile && !buenaConductaWindowOk(buenaIssue, today)) {
          return `El certificado debe tener menos de ${BUENA_CONDUCTA_MAX_AGE_DAYS} días de emitido.`;
        }
        if (certFile && certStage && needsExpiryInput(certStage) && !certExpiry) return tv.form.missingDate;
        if (insFile && !insExpiry) return tv.form.missingDate;
        if (!docsConsent) return tv.form.missingConsent;
      }
      if (!accepted) return es.legal.acceptRequired;
    }
    return null;
  }

  const currentError = stepError(step);

  // New step starts at the top, so the first field is in view on a phone.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  function next() {
    if (stepError(step)) return;
    setError(null);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Enter on an earlier step advances instead of submitting.
    if (step < TOTAL_STEPS) return next();
    setError(null);
    for (let n = 1; n <= TOTAL_STEPS; n++) {
      const err = stepError(n);
      if (err) {
        setStep(n);
        return setError(err);
      }
    }
    if (!idFile) return;

    setBusy(true);
    try {
      // Shrink photos on the phone before upload. Keeps data use low on weak signal.
      const idDocument = await resizeImage(idFile);
      const workPhotos = await Promise.all(workFiles.map((f) => resizeImage(f)));

      let company: CompanyInput | undefined;
      if (isCompany && companyDocFile) {
        const isPdf = companyDocFile.type === "application/pdf";
        company = {
          razonSocial: razonSocial.trim(),
          rnc: rnc.trim(),
          // PDFs upload as-is. Images shrink like the other photos.
          document: isPdf ? companyDocFile : await resizeImage(companyDocFile),
          documentType: isPdf ? "application/pdf" : "image/jpeg",
        };
      }

      const supabase = createSupabaseBrowserClient();
      // Recorded before the application is sent. If this fails, no application is created.
      await recordLegalAcceptance(supabase, ["pro_terms", "community"]);
      await createProApplication(supabase, {
        fullName: fullName.trim(),
        trade,
        zone: zone.trim(),
        municipalityId,
        priceMinDop: Number(priceMin),
        priceMaxDop: Number(priceMax),
        priceUnit: priceUnit as Parameters<typeof createProApplication>[1]["priceUnit"],
        idDocument,
        workPhotos,
        proType,
        company,
        customLine: isCompany && customLine.trim() ? customLine.trim() : undefined,
        avatar: avatarFile ? await resizeImage(avatarFile) : undefined,
      });

      // Verification documents. The application already exists, so a failed upload never rolls it back.
      // The pro re-uploads on /pro/verificacion, whose checklist shows what is missing.
      const uploads: DocUpload[] = [];
      if (!isCompany) {
        if (selfieFile) uploads.push({ stage: "selfie", file: selfieFile, issueDate: null, expiresAt: null });
        if (buenaFile) uploads.push({ stage: "buena_conducta", file: buenaFile, issueDate: buenaIssue, expiresAt: null });
        if (certFile && certStage) {
          uploads.push({ stage: certStage, file: certFile, issueDate: null, expiresAt: needsExpiryInput(certStage) ? certExpiry : null });
        }
        if (diplomaFile) uploads.push({ stage: "diploma", file: diplomaFile, issueDate: null, expiresAt: null });
        if (insFile) uploads.push({ stage: "insurance", file: insFile, issueDate: null, expiresAt: insExpiry });
      }

      const { data: userData } = await supabase.auth.getUser();
      const proId = userData.user?.id ?? null;
      const failed: string[] = [];
      for (const u of uploads) {
        try {
          if (!proId) throw new Error("no session");
          const { blob, contentType } = await toUpload(u.file);
          await submitVerification(supabase, {
            proId,
            stage: u.stage,
            file: blob,
            contentType,
            issueDate: needsIssueInput(u.stage) ? u.issueDate : null,
            expiresAt: u.expiresAt,
            consentVersion: DOCUMENT_CONSENT_VERSION,
          });
        } catch {
          failed.push(tv.stageLabels[u.stage]);
        }
      }
      if (failed.length > 0) {
        setPartialFailures(failed);
        return;
      }
      router.push("/pro/estado");
      router.refresh();
    } catch {
      setError(es.registration.failed);
    } finally {
      setBusy(false);
    }
  }

  if (partialFailures) {
    return (
      <section className="stack">
        <h1>{es.registration.title}</h1>
        <p className="notice" role="status">{es.registration.docsSubmitNote}</p>
        <p className="muted">{partialFailures.join(" · ")}</p>
        <Link className="button" href="/pro/estado">{es.registration.docsContinue}</Link>
      </section>
    );
  }

  const stepTitle = es.registration.stepNames[step - 1];

  return (
    <form className="stack wizard" onSubmit={onSubmit} noValidate>
      <WizardHeader step={step} total={TOTAL_STEPS} title={stepTitle} />

      {step === 1 && (
        <div className="stack">
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
            <span>{es.registration.trade}</span>
            <select name="trade" required value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="" disabled>—</option>
              {trades.map((t) => (
                <option key={t.key} value={t.key}>{t.proLabel}</option>
              ))}
            </select>
          </label>
          <MunicipalityPicker municipalities={municipalities} value={municipalityId} onChange={setMunicipalityId} label="Municipio" required />
          <label className="field">
            <span>{es.registration.zone}</span>
            <input
              name="zone"
              list="sector-suggestions"
              required
              minLength={2}
              maxLength={60}
              style={{ minHeight: 44 }}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
            <datalist id="sector-suggestions">
              {sectorSuggestions.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <h2>{stepTitle}</h2>
          <label className="field">
            <span>{isCompany ? es.registration.representativeName : es.registration.name}</span>
            <input name="fullName" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          {isCompany && (
            <fieldset className="stack">
              <legend>{es.registration.companyTitle}</legend>
              <label className="field">
                <span>{es.registration.razonSocial}</span>
                <input name="razonSocial" required value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
              </label>
              <label className="field">
                <span>{es.registration.rnc}</span>
                <input
                  name="rnc"
                  inputMode="numeric"
                  pattern="[0-9]{9}"
                  maxLength={9}
                  required
                  value={rnc}
                  onChange={(e) => setRnc(e.target.value)}
                />
              </label>
              <p className="muted">{es.registration.rncHint}</p>
              <label className="field">
                <span>{es.registration.customLine}</span>
                <input name="customLine" maxLength={80} value={customLine} onChange={(e) => setCustomLine(e.target.value)} />
              </label>
              <p className="muted">{es.registration.customLineHint}</p>
            </fieldset>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <h2>{stepTitle}</h2>
          <div className="row">
            <label className="field">
              <span>{es.registration.priceMin}</span>
              <input name="priceMin" type="number" inputMode="numeric" min={0} step={1} required value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            </label>
            <label className="field">
              <span>{es.registration.priceMax}</span>
              <input name="priceMax" type="number" inputMode="numeric" min={0} step={1} required value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </label>
          </div>
          <p className="muted">{es.registration.priceHint}</p>
          <label className="field">
            <span>{es.priceUnit.label}</span>
            <select name="priceUnit" required value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)}>
              <option value="job">{es.priceUnit.job}</option>
              <option value="hour">{es.priceUnit.hour}</option>
              <option value="visit">{es.priceUnit.visit}</option>
            </select>
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          <h2>{stepTitle}</h2>
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
          {isCompany && (
            <FilePick
              label={es.registration.companyDocLabel}
              preview={false}
              hint={es.registration.companyDocHint}
              buttonLabel={es.registration.chooseDoc}
              accept={DOC_ACCEPT}
              files={companyDocFile ? [companyDocFile] : []}
              onFiles={(files) => setCompanyDocFile(files[0] ?? null)}
            />
          )}
        </div>
      )}

      {step === 5 && (
        <div className="stack">
          <h2>{stepTitle}</h2>
          {!isCompany && (
            <fieldset className="stack">
              <legend>{es.registration.docsTitle}</legend>
              <p className="muted">{es.registration.docsIntro}</p>

              <div className="stack">
                <span className="badge">{es.registration.docsRequired}</span>
                <FilePick
                  label={tv.stageLabels.selfie}
                  hint={tv.form.fileSelfie}
                  buttonLabel={es.common.chooseOne}
                  accept="image/*"
                  capture="user"
                  preview={false}
                  files={selfieFile ? [selfieFile] : []}
                  onFiles={(files) => setSelfieFile(files[0] ?? null)}
                />
              </div>

              <div className="stack">
                <span className="badge">{tv.optional}</span>
                <FilePick
                  label={tv.stageLabels.buena_conducta}
                  hint={tv.badgeRule}
                  buttonLabel={es.common.chooseOne}
                  accept={DOC_ACCEPT}
                  preview={false}
                  files={buenaFile ? [buenaFile] : []}
                  onFiles={(files) => setBuenaFile(files[0] ?? null)}
                />
                <label className="field">
                  <span>{tv.form.issueDate}</span>
                  <input type="date" value={buenaIssue} onChange={(e) => setBuenaIssue(e.target.value)} style={{ minHeight: 44 }} />
                </label>
              </div>

              {certStage ? (
                <div className="stack">
                  <span className="badge">{tv.optional}</span>
                  <FilePick
                    label={tv.stageLabels[certStage]}
                    buttonLabel={es.common.chooseOne}
                    accept={DOC_ACCEPT}
                    preview={false}
                    files={certFile ? [certFile] : []}
                    onFiles={(files) => setCertFile(files[0] ?? null)}
                  />
                  {needsExpiryInput(certStage) ? (
                    <label className="field">
                      <span>{tv.form.expiryDate}</span>
                      <input type="date" value={certExpiry} onChange={(e) => setCertExpiry(e.target.value)} style={{ minHeight: 44 }} />
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="muted">{es.registration.docsChooseOfficio}</p>
              )}

              <div className="stack">
                <span className="badge">{tv.optional}</span>
                <FilePick
                  label={tv.stageLabels.diploma}
                  buttonLabel={es.common.chooseOne}
                  accept={DOC_ACCEPT}
                  preview={false}
                  files={diplomaFile ? [diplomaFile] : []}
                  onFiles={(files) => setDiplomaFile(files[0] ?? null)}
                />
              </div>

              <div className="stack">
                <span className="badge">{tv.optional}</span>
                <FilePick
                  label={tv.stageLabels.insurance}
                  buttonLabel={es.common.chooseOne}
                  accept={DOC_ACCEPT}
                  preview={false}
                  files={insFile ? [insFile] : []}
                  onFiles={(files) => setInsFile(files[0] ?? null)}
                />
                <label className="field">
                  <span>{tv.form.expiryDate}</span>
                  <input type="date" value={insExpiry} onChange={(e) => setInsExpiry(e.target.value)} style={{ minHeight: 44 }} />
                </label>
              </div>

              <label className="check-row">
                <input type="checkbox" checked={docsConsent} disabled={busy} onChange={(e) => setDocsConsent(e.target.checked)} />
                <span>{tv.form.consentLabel}</span>
              </label>
              <p className="muted">{tv.form.consentDraft}</p>
            </fieldset>
          )}
          <AcceptLegal kind="pro" checked={accepted} disabled={busy} onChange={setAccepted} />
        </div>
      )}

      {/* What is still missing on this step. Continuar stays disabled until it is resolved. */}
      {error ? (
        <p className="error" role="alert">{error}</p>
      ) : currentError ? (
        <p className="muted wizard-missing">{currentError}</p>
      ) : null}

      <WizardBar showBack={step > 1} backLabel={es.registration.back} onBack={back}>
        {step < TOTAL_STEPS ? (
          <button type="button" className="button wizard-next" disabled={!!currentError} onClick={next}>
            {es.registration.docsContinue}
          </button>
        ) : (
          <button type="submit" className="button wizard-next" disabled={busy || !!currentError}>
            {busy ? es.registration.submitting : es.registration.submit}
          </button>
        )}
      </WizardBar>
    </form>
  );
}
