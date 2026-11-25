"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { submitVerification } from "@/lib/data/verification";
import { toVerificationUpload } from "@/lib/media/upload";
import { BUENA_CONDUCTA_MAX_AGE_DAYS, buenaConductaWindowOk, needsExpiryInput, needsIssueInput, todayInSantoDomingo, type Stage } from "@/lib/domain/verification";
import { esVerification as t } from "@/lib/i18n/verification";

const CONSENT_VERSION = "draft-2026-11-16";

/** Upload one verification document. Client-side checks are a convenience; the RPC enforces the rules. */
export function VerificationForm({ proId, stages }: { proId: string; stages: Stage[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(stages[0]);
  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!file) return setMsg({ ok: false, text: t.form.missingFile });
    if (!consent) return setMsg({ ok: false, text: t.form.missingConsent });
    if (needsIssueInput(stage) && !issueDate) return setMsg({ ok: false, text: t.form.missingDate });
    const today = todayInSantoDomingo();
    if (stage === "buena_conducta" && !buenaConductaWindowOk(issueDate, today)) {
      return setMsg({ ok: false, text: `El certificado debe tener menos de ${BUENA_CONDUCTA_MAX_AGE_DAYS} días de emitido.` });
    }
    if (needsExpiryInput(stage) && !expiresAt) return setMsg({ ok: false, text: t.form.missingDate });
    const isImage = file.type.startsWith("image/") || file.type === "";
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) return setMsg({ ok: false, text: t.form.file });

    setBusy(true);
    try {
      // Images are re-encoded to JPEG first (HEIC from iPhone included). PDFs go as-is.
      const { blob, contentType } = await toVerificationUpload(file);
      await submitVerification(createSupabaseBrowserClient(), {
        proId,
        stage,
        file: blob,
        contentType,
        issueDate: needsIssueInput(stage) ? issueDate : null,
        expiresAt: needsExpiryInput(stage) ? expiresAt : null,
        consentVersion: CONSENT_VERSION,
      });
      setMsg({ ok: true, text: t.form.submitted });
      setFile(null);
      setConsent(false);
      router.refresh();
    } catch {
      setMsg({ ok: false, text: t.form.error });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <label className="field">
        <span>{t.form.stage}</span>
        <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {stages.map((s) => (
            <option key={s} value={s}>{t.stageLabels[s]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{stage === "identity" ? t.form.fileIdentity : stage === "selfie" ? t.form.fileSelfie : t.form.file}</span>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {needsIssueInput(stage) ? (
        <label className="field">
          <span>{t.form.issueDate}</span>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
      ) : null}
      {needsExpiryInput(stage) ? (
        <label className="field">
          <span>{t.form.expiryDate}</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
      ) : null}
      <label className="check-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t.form.consentLabel}</span>
      </label>
      <p className="muted">{t.form.consentDraft}</p>
      <button className="button" type="submit" disabled={busy}>
        {busy ? t.form.submitting : t.form.submit}
      </button>
      {msg ? <p className={msg.ok ? "notice" : "error"}>{msg.text}</p> : null}
    </form>
  );
}
