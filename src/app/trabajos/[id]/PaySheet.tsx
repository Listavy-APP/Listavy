"use client";

import { useState } from "react";
import Link from "next/link";
import { tipCapDop, tipForPercentDop } from "@/lib/domain/commission";
import { recordLegalAcceptance } from "@/lib/data/legal";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Pick = "none" | "5" | "10" | "15" | "custom";
const PERCENTS = ["5", "10", "15"] as const;

/** Reads the server's Spanish reason from a failed function call. Falls back to the generic message. */
async function serverMessage(fnError: unknown, fallback: string): Promise<string> {
  try {
    const context = (fnError as { context?: Response })?.context;
    const body = await context?.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // No readable body: use the fallback.
  }
  return fallback;
}

/**
 * What the homeowner pays, line by line, with an optional tip and an optional promo code.
 * The server checks every number again: stripe-checkout reserves the code, validates the tip, and the
 * database refuses an amount that does not match. Applying a code here only previews it (reserves nothing).
 * Tip percentages are of the agreed quote, the same base as the 20% cap.
 */
export function PaySheet(props: { jobId: string; quoteDop: number; creditDop: number; fx: number; urgentFeeDop: number }) {
  const { quoteDop, creditDop, fx, urgentFeeDop } = props;
  const [pick, setPick] = useState<Pick>("none");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Promo code. `applied` is the previewed code and its discount; the server reserves it again on Pagar.
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; discountDop: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const cap = tipCapDop(quoteDop);
  const jobDop = Math.max(0, quoteDop - creditDop);
  const promoDop = applied?.discountDop ?? 0;

  let tip = 0;
  let tipError: string | null = null;
  if (pick === "custom") {
    const n = Number(custom || "0");
    if (n > cap) tipError = es.jobs.payTipTooHigh(cap);
    else tip = n;
  } else if (pick !== "none") {
    tip = tipForPercentDop(quoteDop, Number(pick));
  }

  // Urgent fee (0117): on top of the charged part, never discounted. Before the tip, as the server adds it.
  const total = jobDop - promoDop + urgentFeeDop + tip;
  const usdKnown = Number.isFinite(fx) && fx > 0;
  const usd = usdKnown ? (Math.round((total * 100) / fx) / 100).toFixed(2) : null;

  async function applyCode() {
    const code = codeInput.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("preview_promo_code", { p_job: props.jobId, p_code: code });
      if (rpcError) {
        // PostgREST is not an Error instance. The server's raised text (code P0001) is in message.
        const serverMessage = typeof rpcError.message === "string" ? rpcError.message.trim() : "";
        setApplied(null);
        setPromoError(serverMessage || es.promo.applyFailed);
        return;
      }
      const discountDop = Number((data as { discount_dop?: number })?.discount_dop ?? 0);
      if (discountDop <= 0) throw new Error(es.promo.applyFailed);
      setApplied({ code: code.toUpperCase(), discountDop });
      setCodeInput("");
    } catch (e) {
      setApplied(null);
      setPromoError(e instanceof Error && e.message ? e.message : es.promo.applyFailed);
    } finally {
      setPromoBusy(false);
    }
  }

  function removeCode() {
    setApplied(null);
    setPromoError(null);
  }

  async function pay() {
    setError(null);
    setBusy(true);
    let message: string = es.jobs.payFailed;
    try {
      // Paying confirms the cancellation policy. Recorded first; if it fails, no checkout starts.
      const supabase = createSupabaseBrowserClient();
      await recordLegalAcceptance(supabase, ["cancellation"]);
      const { data, error: fnError } = await supabase.functions.invoke("stripe-checkout", {
        body: { job_id: props.jobId, tip_dop: tip, ...(applied ? { promo_code: applied.code } : {}) },
      });
      if (fnError) {
        // The server gives the Spanish reason for a refused promo code or checkout.
        message = await serverMessage(fnError, es.jobs.payFailed);
        throw new Error(message);
      }
      if (!data?.url) throw new Error(es.jobs.payFailed);
      window.location.assign(data.url as string);
    } catch {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby="pay-title">
      <h2 id="pay-title">{es.jobs.paySummary}</h2>
      <ul className="pay-lines">
        <li>
          <span>{es.jobs.payQuote}</span>
          <span>{es.money.dop(quoteDop)}</span>
        </li>
        {creditDop > 0 ? (
          <li className="credit">
            <span>{es.jobs.payCredit}</span>
            <span>−{es.money.dop(creditDop)}</span>
          </li>
        ) : null}
        {applied ? (
          <li className="credit">
            <span>{es.promo.discountLine(applied.code)}</span>
            <span>−{es.money.dop(applied.discountDop)}</span>
          </li>
        ) : null}
        {urgentFeeDop > 0 ? (
          <li>
            <span>{es.urgent.feeLine(urgentFeeDop)}</span>
            <span>{es.money.dop(urgentFeeDop)}</span>
          </li>
        ) : null}
        {tip > 0 ? (
          <li>
            <span>{es.jobs.payTip}</span>
            <span>{es.money.dop(tip)}</span>
          </li>
        ) : null}
        <li className="total">
          <span>{es.jobs.payTotal}</span>
          <span>{es.money.dop(total)}</span>
        </li>
      </ul>
      {usd ? <p className="muted">{es.jobs.payUsd(usd, fx)}</p> : null}

      <div className="stack" role="group" aria-labelledby="pay-promo-title">
        <span id="pay-promo-title" className="field-label">{es.promo.title}</span>
        {applied ? (
          <div className="row">
            <span>{applied.code}</span>
            <button className="button secondary" type="button" disabled={busy} onClick={removeCode}>
              {es.promo.remove}
            </button>
          </div>
        ) : (
          <div className="row">
            <label className="field">
              <span>{es.promo.codeLabel}</span>
              <input
                id="pay-promo-code"
                value={codeInput}
                aria-invalid={promoError ? true : undefined}
                aria-describedby="pay-promo-msg"
                disabled={promoBusy || busy}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => setCodeInput(e.target.value)}
              />
            </label>
            <button className="button secondary" type="button" disabled={promoBusy || busy || !codeInput.trim()} onClick={applyCode}>
              {promoBusy ? es.promo.checking : es.promo.apply}
            </button>
          </div>
        )}
        {promoError ? <p id="pay-promo-msg" className="error" role="alert">{promoError}</p> : <p id="pay-promo-msg" className="muted">{es.promo.hint}</p>}
      </div>

      <div className="stack" role="group" aria-labelledby="pay-tip-title">
        <span id="pay-tip-title" className="field-label">{es.jobs.payTipTitle}</span>
        <div className="chip-wrap">
          <button type="button" className={`chip${pick === "none" ? " on" : ""}`} aria-pressed={pick === "none"} disabled={busy} onClick={() => setPick("none")}>
            {es.jobs.payTipNone}
          </button>
          {PERCENTS.map((p) => (
            <button key={p} type="button" className={`chip${pick === p ? " on" : ""}`} aria-pressed={pick === p} disabled={busy} onClick={() => setPick(p)}>
              {p}%
            </button>
          ))}
          <button type="button" className={`chip${pick === "custom" ? " on" : ""}`} aria-pressed={pick === "custom"} disabled={busy} onClick={() => setPick("custom")}>
            {es.jobs.payTipCustom}
          </button>
        </div>
        {pick === "custom" ? (
          <label className="field">
            <span>{es.jobs.payTipCustomLabel}</span>
            <input
              inputMode="numeric"
              value={custom}
              disabled={busy}
              aria-invalid={tipError ? true : undefined}
              aria-describedby="pay-tip-msg"
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        ) : null}
        {tipError ? <p id="pay-tip-msg" className="error" role="alert">{tipError}</p> : <p id="pay-tip-msg" className="muted">{es.jobs.payTipHint}</p>}
      </div>

      <div className="stack">
        <span className="field-label">{es.legal.cancelSummaryTitle}</span>
        <p className="muted">{es.legal.cancelSummaryFee}</p>
        <p className="muted">{es.legal.cancelSummaryEscrow}</p>
        <Link href="/cancelacion">{es.legal.cancelSummaryLink}</Link>
        <p className="muted">{es.legal.cancelSummaryConfirm}</p>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="button" type="button" disabled={busy || promoBusy || tipError !== null || total <= 0} onClick={pay}>
        {busy ? es.jobs.sending : es.jobs.payAmount(total)}
      </button>
      <p className="muted">{es.jobs.payHint}</p>
    </section>
  );
}
