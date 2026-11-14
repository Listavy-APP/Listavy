"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type SavedAddress = {
  id: string;
  label: string;
  street: string;
  zone: string | null;
  reference: string | null;
  is_default: boolean;
};

type Draft = {
  id: string | null;
  label: string;
  street: string;
  zone: string;
  reference: string;
};

const EMPTY: Draft = { id: null, label: es.addresses.types[0], street: "", zone: "", reference: "" };

/**
 * Saved addresses (stored only). Owner-only RLS on the table is the security boundary;
 * the user_id filter here is for clarity, not access control.
 * Setting a default clears the old one first, then sets the new one, so the
 * one-default-per-user unique index is never violated.
 */
export function AddressManager(props: { userId: string; addresses: SavedAddress[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const row = {
        label: draft.label,
        street: draft.street.trim(),
        zone: draft.zone.trim() || null,
        reference: draft.reference.trim() || null,
      };
      const isFirst = props.addresses.length === 0;
      if (draft.id) {
        const { error: err } = await supabase.from("addresses").update(row).eq("id", draft.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("addresses")
          .insert({ ...row, user_id: props.userId, is_default: isFirst });
        if (err) throw err;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError(es.addresses.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.from("addresses").delete().eq("id", id);
      if (err) throw err;
      router.refresh();
    } catch {
      setError(es.addresses.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: clearErr } = await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", props.userId)
        .eq("is_default", true);
      if (clearErr) throw clearErr;
      const { error: setErr } = await supabase.from("addresses").update({ is_default: true }).eq("id", id);
      if (setErr) throw setErr;
      router.refresh();
    } catch {
      setError(es.addresses.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="muted">{es.addresses.hint}</p>

      {props.addresses.length === 0 ? (
        <p className="muted">{es.addresses.empty}</p>
      ) : (
        <ul className="list">
          {props.addresses.map((a) => (
            <li key={a.id}>
              <strong>{a.label}</strong>
              {a.is_default ? <span className="muted"> · {es.addresses.defaultBadge}</span> : null}
              <div>{a.street}</div>
              {a.zone ? <div className="muted">{a.zone}</div> : null}
              {a.reference ? <div className="muted">{a.reference}</div> : null}
              <div className="row">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setDraft({
                      id: a.id,
                      label: a.label,
                      street: a.street,
                      zone: a.zone ?? "",
                      reference: a.reference ?? "",
                    })
                  }
                >
                  {es.addresses.edit}
                </button>
                {a.is_default ? null : (
                  <button className="button secondary" type="button" disabled={busy} onClick={() => makeDefault(a.id)}>
                    {es.addresses.setDefault}
                  </button>
                )}
              </div>
              <button className="button danger" type="button" disabled={busy} onClick={() => remove(a.id)}>
                {es.addresses.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form className="stack" onSubmit={save}>
          <label className="field">
            {es.addresses.labelField}
            <select value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}>
              {es.addresses.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {es.addresses.streetField}
            <input required maxLength={200} value={draft.street} onChange={(e) => setDraft({ ...draft, street: e.target.value })} />
          </label>
          <label className="field">
            {es.addresses.zoneField}
            <input maxLength={100} value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value })} />
          </label>
          <label className="field">
            {es.addresses.referenceField}
            <input maxLength={200} value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
          </label>
          <div className="row">
            <button className="button" type="submit" disabled={busy}>
              {es.addresses.save}
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => setDraft(null)}>
              {es.addresses.cancel}
            </button>
          </div>
        </form>
      ) : (
        <button className="button secondary" type="button" disabled={busy} onClick={() => setDraft({ ...EMPTY })}>
          {es.addresses.add}
        </button>
      )}

      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
