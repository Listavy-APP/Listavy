"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MunicipalityPicker } from "@/components/MunicipalityPicker";
import type { Municipality } from "@/lib/data/municipalities";
import { archiveProperty, saveProperty, type Property } from "@/lib/data/properties";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Draft = {
  id: string | null;
  name: string;
  municipality_id: string;
  address_detail: string;
  business_name: string;
  access_notes: string;
};

const EMPTY: Draft = { id: null, name: "", municipality_id: "", address_detail: "", business_name: "", access_notes: "" };

/**
 * Client properties. Owner-only RLS (0119) is the security boundary. Archive keeps the row, because jobs reference it.
 * Access notes are shown here to the owner only; they never appear on public pages or in notifications.
 */
export function PropertyManager(props: { userId: string; properties: Property[]; municipalities: Municipality[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const munName = (id: string) => props.municipalities.find((m) => m.id === id)?.name ?? "";

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.municipality_id) return setError(es.properties.pickerHint);
    setBusy(true);
    setError(null);
    try {
      await saveProperty(createSupabaseBrowserClient(), props.userId, draft.id, {
        name: draft.name.trim(),
        municipality_id: draft.municipality_id,
        address_detail: draft.address_detail.trim() || null,
        business_name: draft.business_name.trim() || null,
        access_notes: draft.access_notes.trim() || null,
      });
      setDraft(null);
      router.refresh();
    } catch {
      setError(es.properties.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setBusy(true);
    setError(null);
    try {
      await archiveProperty(createSupabaseBrowserClient(), id);
      setConfirmId(null);
      router.refresh();
    } catch {
      setError(es.properties.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="muted">{es.properties.hint}</p>

      {props.properties.length === 0 ? (
        <p className="muted">{es.properties.empty}</p>
      ) : (
        <ul className="list">
          {props.properties.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong>
              <div className="muted">{munName(p.municipality_id)}</div>
              {p.business_name ? <div>{es.properties.businessName}: {p.business_name}</div> : null}
              {p.address_detail ? <div className="muted">{p.address_detail}</div> : null}
              {p.access_notes ? (
                <div className="muted">
                  {es.properties.accessNotes}: {p.access_notes}
                </div>
              ) : null}
              <div className="row">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setDraft({
                      id: p.id,
                      name: p.name,
                      municipality_id: p.municipality_id,
                      address_detail: p.address_detail ?? "",
                      business_name: p.business_name ?? "",
                      access_notes: p.access_notes ?? "",
                    })
                  }
                >
                  {es.properties.edit}
                </button>
              </div>
              {confirmId === p.id ? (
                <div className="stack">
                  <p>{es.properties.confirmArchive}</p>
                  <div className="row">
                    <button className="button danger" type="button" disabled={busy} onClick={() => archive(p.id)}>
                      {es.properties.confirmArchiveYes}
                    </button>
                    <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmId(null)}>
                      {es.properties.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="button danger" type="button" disabled={busy} onClick={() => setConfirmId(p.id)}>
                  {es.properties.archive}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form className="stack" onSubmit={save}>
          <label className="field">
            {es.properties.nameField}
            <input required minLength={3} maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <MunicipalityPicker
            municipalities={props.municipalities}
            value={draft.municipality_id}
            onChange={(id) => setDraft({ ...draft, municipality_id: id })}
            name="municipality"
            label={es.properties.municipalityField}
            required
          />
          <label className="field">
            {es.properties.addressField}
            <input maxLength={200} value={draft.address_detail} onChange={(e) => setDraft({ ...draft, address_detail: e.target.value })} />
          </label>
          <label className="field">
            {es.properties.businessField}
            <input maxLength={80} value={draft.business_name} onChange={(e) => setDraft({ ...draft, business_name: e.target.value })} />
          </label>
          <p className="muted">{es.properties.businessHint}</p>
          <label className="field">
            {es.properties.accessField}
            <textarea maxLength={500} rows={3} value={draft.access_notes} onChange={(e) => setDraft({ ...draft, access_notes: e.target.value })} />
          </label>
          <p className="muted">{es.properties.accessHint}</p>
          <div className="row">
            <button className="button" type="submit" disabled={busy}>
              {es.properties.save}
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => setDraft(null)}>
              {es.properties.cancel}
            </button>
          </div>
        </form>
      ) : (
        <button className="button secondary" type="button" disabled={busy} onClick={() => setDraft({ ...EMPTY })}>
          {es.properties.add}
        </button>
      )}

      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
