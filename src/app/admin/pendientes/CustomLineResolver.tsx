"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { es } from "@/lib/i18n/es";
import type { CatalogTrade } from "@/lib/data/trades";

type Action = "map" | "create_trade" | "profile_only";

/**
 * Admin decision on a company's free-text line of work (0110). Three outcomes:
 * map to an existing trade, create a new catalog trade (super admin only), or keep it as a profile label.
 * Every outcome goes through admin_resolve_custom_line, which checks the role, requires a reason, and audits.
 */
export function CustomLineResolver({
  proId,
  customLine,
  trades,
  isSuper,
}: {
  proId: string;
  customLine: string;
  trades: CatalogTrade[];
  isSuper: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>("map");
  const [trade, setTrade] = useState(trades[0]?.key ?? "");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState(customLine);
  const [newSlug, setNewSlug] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOk = reason.trim().length >= 10;
  const createOk = /^[a-z][a-z_]{1,39}$/.test(newKey) && newLabel.trim().length >= 2 && /^[a-z0-9-]{2,60}$/.test(newSlug);
  const canSave = reasonOk && (action === "profile_only" || (action === "map" && trade) || (action === "create_trade" && createOk));

  async function save() {
    setBusy(true);
    setError(null);
    const { error: err } = await createSupabaseBrowserClient().rpc("admin_resolve_custom_line", {
      p_pro: proId,
      p_action: action,
      p_trade: action === "map" ? trade : null,
      p_new_key: action === "create_trade" ? newKey : null,
      p_new_label: action === "create_trade" ? newLabel.trim() : null,
      p_new_slug: action === "create_trade" ? newSlug : null,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (err) return setError(err.message || es.adminPending.lineFail);
    router.refresh();
  }

  return (
    <div className="stack panel">
      <h3>{es.adminPending.lineTitle}</h3>
      <p><strong>{customLine}</strong></p>

      <fieldset className="stack">
        <legend className="muted">{es.adminPending.lineChoose}</legend>
        <label className="row"><input type="radio" name={`act-${proId}`} checked={action === "map"} onChange={() => setAction("map")} /> {es.adminPending.lineMap}</label>
        {action === "map" ? (
          <select value={trade} onChange={(e) => setTrade(e.target.value)} style={{ minHeight: 44 }}>
            {trades.map((t) => <option key={t.key} value={t.key}>{t.proLabel}</option>)}
          </select>
        ) : null}

        <label className="row"><input type="radio" name={`act-${proId}`} checked={action === "create_trade"} disabled={!isSuper} onChange={() => setAction("create_trade")} /> {es.adminPending.lineCreate}</label>
        {!isSuper ? <p className="muted">{es.adminPending.lineSuperOnly}</p> : null}
        {action === "create_trade" && isSuper ? (
          <div className="stack">
            <label className="field"><span>{es.adminPending.lineKey}</span><input value={newKey} onChange={(e) => setNewKey(e.target.value)} maxLength={40} /></label>
            <label className="field"><span>{es.adminPending.lineLabel}</span><input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={60} /></label>
            <label className="field"><span>{es.adminPending.lineSlug}</span><input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} maxLength={60} /></label>
          </div>
        ) : null}

        <label className="row"><input type="radio" name={`act-${proId}`} checked={action === "profile_only"} onChange={() => setAction("profile_only")} /> {es.adminPending.lineProfileOnly}</label>
      </fieldset>

      <label className="stack">
        <span>{es.adminPending.lineReason}</span>
        <textarea value={reason} maxLength={500} rows={2} onChange={(e) => setReason(e.target.value)} />
      </label>

      {error ? <p role="alert" className="error">{error}</p> : null}
      <button className="button" type="button" disabled={busy || !canSave} onClick={save} style={{ minHeight: 44 }}>
        {es.adminPending.lineSave}
      </button>
    </div>
  );
}
