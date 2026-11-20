"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { digitsOnly, validatePayoutDetails, type PayoutDetailsErrors } from "@/lib/domain/payout-details";
import { savePayoutDetails, type PayoutDetailsSummary } from "@/lib/data/payouts";
import { esPayouts as t } from "@/lib/i18n/payouts";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "view" | "edit" | "confirm";

/** Collects the pro's bank details for a future payout. The saved account number is shown masked and never sent to the browser. */
export function PayoutDetailsCard({ proId, initial }: { proId: string; initial: PayoutDetailsSummary | null }) {
  const router = useRouter();
  const [summary, setSummary] = useState<PayoutDetailsSummary | null>(initial);
  const [mode, setMode] = useState<Mode>(initial ? "view" : "edit");
  const [bankCode, setBankCode] = useState(initial?.bankCode ?? "");
  const [branchCode, setBranchCode] = useState(initial?.branchCode ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [errors, setErrors] = useState<PayoutDetailsErrors>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function startEdit() {
    setErrors({});
    setMsg(null);
    setAccountNumber("");
    setMode("edit");
  }

  function cancelEdit() {
    setErrors({});
    setMsg(null);
    setBankCode(summary?.bankCode ?? "");
    setBranchCode(summary?.branchCode ?? "");
    setAccountNumber("");
    setMode("view");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const result = validatePayoutDetails({ bankCode, branchCode, accountNumber });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    // Changing a saved account needs an inline confirm. A first save goes straight through.
    if (summary) setMode("confirm");
    else void save();
  }

  async function save() {
    const result = validatePayoutDetails({ bankCode, branchCode, accountNumber });
    if (!result.ok) {
      setErrors(result.errors);
      setMode("edit");
      return;
    }
    setBusy(true);
    try {
      await savePayoutDetails(createSupabaseBrowserClient(), proId, result.value);
      setSummary({
        bankCode: result.value.bank_code,
        branchCode: result.value.branch_code,
        accountMasked: `•••• ${result.value.account_number.slice(-4)}`,
      });
      setAccountNumber("");
      setMode("view");
      setMsg({ ok: true, text: t.saved });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: t.failed });
      setMode("edit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <h2>{t.cardTitle}</h2>
      <p className="muted">{t.preparing}</p>
      {msg ? <p className={msg.ok ? "notice" : "error"}>{msg.text}</p> : null}

      {mode === "view" && summary ? (
        <div className="stack">
          <p>
            <strong>{t.bankLabel}:</strong> {summary.bankCode}
            {summary.branchCode ? <> · <strong>{t.branchLabel}:</strong> {summary.branchCode}</> : null}
          </p>
          <p>
            <strong>{t.accountLabel}:</strong> {summary.accountMasked}
          </p>
          <button className="button secondary" type="button" onClick={startEdit}>
            {t.edit}
          </button>
        </div>
      ) : null}

      {mode === "view" && !summary ? <p className="muted">{t.noneSaved}</p> : null}

      {mode === "edit" || mode === "confirm" ? (
        <form className="stack" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>{t.bankCode}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={bankCode}
              onChange={(e) => setBankCode(digitsOnly(e.target.value, 3))}
              aria-invalid={errors.bankCode ? true : undefined}
              aria-describedby={errors.bankCode ? "payout-bank-error" : undefined}
            />
            {errors.bankCode ? <span id="payout-bank-error" className="error" role="alert">{errors.bankCode}</span> : null}
          </label>
          <label className="field">
            <span>{t.branchCode}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={branchCode}
              onChange={(e) => setBranchCode(digitsOnly(e.target.value, 5))}
              aria-invalid={errors.branchCode ? true : undefined}
              aria-describedby={errors.branchCode ? "payout-branch-error" : undefined}
            />
            {errors.branchCode ? <span id="payout-branch-error" className="error" role="alert">{errors.branchCode}</span> : null}
          </label>
          <label className="field">
            <span>{t.accountNumber}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={28}
              value={accountNumber}
              onChange={(e) => setAccountNumber(digitsOnly(e.target.value, 28))}
              aria-invalid={errors.accountNumber ? true : undefined}
              aria-describedby={errors.accountNumber ? "payout-account-error" : undefined}
            />
            {errors.accountNumber ? <span id="payout-account-error" className="error" role="alert">{errors.accountNumber}</span> : null}
            {summary ? <span className="muted">{t.accountHint}</span> : null}
          </label>

          {mode === "confirm" ? (
            <div className="panel stack">
              <p>{t.confirmChange}</p>
              <div className="row">
                <button className="button danger" type="button" disabled={busy} onClick={() => void save()}>
                  {t.confirmYes}
                </button>
                <button className="button secondary" type="button" disabled={busy} onClick={() => setMode("edit")}>
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button className="button" type="submit" disabled={busy}>
                {busy ? t.saving : t.save}
              </button>
              {summary ? (
                <button className="button secondary" type="button" disabled={busy} onClick={cancelEdit}>
                  {t.cancel}
                </button>
              ) : null}
            </div>
          )}
        </form>
      ) : null}
    </section>
  );
}
