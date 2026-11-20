"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelJobWithRefund, getCancellationPreview, type CancellationPreview } from "@/lib/data/jobs";
import { formatDop } from "@/lib/domain/cancellation";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const CANCELABLE = ["requested", "quoted", "accepted"];

/**
 * Cancel control for both sides. Calls cancel_job_with_refund as-is; the function enforces
 * the state rule and the refund. The inline confirm replaces window.confirm (automated
 * browsers dismiss native dialogs). This stays mounted across router.refresh so the
 * result message survives the status change to "cancelled".
 */
export function CancelJobPanel({
  jobId,
  role,
  status,
  legacyCancel,
}: {
  jobId: string;
  role: "homeowner" | "pro";
  status: string;
  /** Homeowner in requested/quoted keeps the cancel_job_request button (it also withdraws quotes). */
  legacyCancel: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"refund_pending" | "cancelled" | null>(null);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  if (done) {
    const message =
      role === "pro"
        ? done === "refund_pending"
          ? es.jobs.cancelJobDoneProRefund
          : es.jobs.cancelJobDoneProNoCharge
        : done === "refund_pending"
          ? es.jobs.cancelJobDoneRefund
          : es.jobs.cancelJobDoneNoCharge;
    return <p className="ok" role="status">{message}</p>;
  }

  if (!CANCELABLE.includes(status)) return null;
  if (legacyCancel && (status === "requested" || status === "quoted")) return null;

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const result = await cancelJobWithRefund(createSupabaseBrowserClient(), jobId, role);
      setDone(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : es.jobs.cancelJobError);
    } finally {
      setBusy(false);
    }
  }

  function openConfirm() {
    setConfirming(true);
    setPreview(null);
    setPreviewFailed(false);
    getCancellationPreview(createSupabaseBrowserClient(), jobId)
      .then(setPreview)
      .catch(() => setPreviewFailed(true));
  }

  // Client notice comes from the server preview, so it matches what cancel_job_with_refund will do.
  const feeNotice =
    role === "homeowner" && preview?.cancelable
      ? preview.fee_dop > 0
        ? es.jobs.cancelJobFeeNotice.replace("{fee}", formatDop(preview.fee_dop))
        : es.jobs.cancelJobFreeNotice
      : null;
  const previewReady = role === "pro" || preview !== null;

  if (!confirming) {
    return (
      <button className="button secondary" type="button" disabled={busy} onClick={openConfirm}>
        {es.jobs.cancelJobOpen}
      </button>
    );
  }

  return (
    <div className="stack" role="group" aria-label={es.jobs.cancelJobOpen}>
      <p className="muted">{role === "pro" ? es.jobs.cancelJobConfirmPro : es.jobs.cancelJobConfirmClient}</p>
      {role === "homeowner" ? (
        previewFailed ? <p className="error" role="alert">{es.jobs.cancelJobPreviewError}</p>
        : feeNotice ? <p role="status">{feeNotice}</p>
        : <p className="muted">{es.jobs.cancelJobPreviewLoading}</p>
      ) : null}
      <button className="button" type="button" disabled={busy || !previewReady} onClick={confirm}>
        {es.jobs.cancelJobConfirmYes}
      </button>
      <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>
        {es.jobs.cancelJobBack}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
