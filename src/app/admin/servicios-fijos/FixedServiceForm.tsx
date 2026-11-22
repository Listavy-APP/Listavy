"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminUpsertFixedService } from "@/lib/data/fixed";
import { isValidSlug, slugify, type FixedServiceRow } from "@/lib/domain/fixed-service";
import type { CatalogTrade } from "@/lib/data/trades";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Create or edit one fixed service. Calls admin_upsert_fixed_service (super admin, AAL2, reason, admin_log). */
export function FixedServiceForm({ trades, existing }: { trades: CatalogTrade[]; existing: FixedServiceRow | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(existing === null);
  const [trade, setTrade] = useState(existing?.trade ?? trades[0]?.key ?? "");
  const [name, setName] = useState(existing?.name_es ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [includes, setIncludes] = useState(existing?.includes_es ?? "");
  const [price, setPrice] = useState(existing ? String(existing.price_dop) : "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [sortOrder, setSortOrder] = useState(existing ? String(existing.sort_order) : "1000");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const priceNum = Number(price);
    const finalSlug = slug.trim() || slugify(name);
    if (!Number.isInteger(priceNum) || priceNum <= 0) return setError(es.fixed.admin.needPrice);
    if (!isValidSlug(finalSlug)) return setError(es.fixed.admin.needSlug);
    if (reason.trim().length < 10) return setError(es.fixed.admin.needReason);

    setBusy(true);
    try {
      await adminUpsertFixedService(createSupabaseBrowserClient(), {
        id: existing?.id ?? null,
        trade,
        slug: finalSlug,
        nameEs: name.trim(),
        includesEs: includes.trim(),
        priceDop: priceNum,
        active,
        sortOrder: Number(sortOrder) || 1000,
        reason: reason.trim(),
      });
      setSaved(true);
      setReason("");
      if (existing === null) {
        setName("");
        setSlug("");
        setIncludes("");
        setPrice("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.fixed.admin.failed);
    } finally {
      setBusy(false);
    }
  }

  if (existing && !open) {
    return (
      <button className="button secondary" type="button" onClick={() => setOpen(true)}>
        {es.fixed.admin.editService}
      </button>
    );
  }

  return (
    <form className="stack panel" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span>{es.fixed.admin.trade}</span>
        <select value={trade} onChange={(e) => setTrade(e.target.value)} disabled={busy || existing !== null}>
          {trades.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{es.fixed.admin.name}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={80} style={{ minHeight: 44 }} />
      </label>
      <label className="field">
        <span>{es.fixed.admin.slug}</span>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={slugify(name)} disabled={busy} style={{ minHeight: 44 }} />
      </label>
      <label className="field">
        <span>{es.fixed.admin.includes}</span>
        <textarea value={includes} onChange={(e) => setIncludes(e.target.value)} rows={3} disabled={busy} maxLength={600} />
      </label>
      <label className="field">
        <span>{es.fixed.admin.price}</span>
        <input type="number" inputMode="numeric" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy} style={{ minHeight: 44 }} />
      </label>
      <label className="field">
        <span>{es.fixed.admin.sort}</span>
        <input type="number" inputMode="numeric" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={busy} style={{ minHeight: 44 }} />
      </label>
      <label className="field" style={{ display: "flex", gap: 12, alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} />
        <span>{es.fixed.admin.active}</span>
      </label>
      <label className="field">
        <span>{es.fixed.admin.reason}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} placeholder={es.fixed.admin.reasonHint} style={{ minHeight: 44 }} />
      </label>
      <button className="button" type="submit" disabled={busy}>
        {es.fixed.admin.save}
      </button>
      {saved ? <p className="ok" role="status">{es.fixed.admin.saved}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
