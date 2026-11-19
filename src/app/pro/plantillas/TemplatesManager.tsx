"use client";

import { useState, type FormEvent } from "react";
import { TextArea } from "@/components/ui/TextArea";
import { validateTemplate, TEMPLATE_LIMITS } from "@/lib/domain/pro-tools";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, type QuoteTemplate } from "@/lib/data/pro-tools";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAX_TEMPLATES = 20;
const money = (n: number) => `RD$${n.toLocaleString("es-DO")}`;

type FormValues = { title: string; amount: string; note: string };

function TemplateForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FormValues;
  busy: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(values);
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>{es.proTemplates.nameLabel}</span>
        <input
          maxLength={TEMPLATE_LIMITS.titleMax}
          value={values.title}
          onChange={(e) => setValues({ ...values, title: e.target.value })}
          required
        />
      </label>
      <label className="field">
        <span>{es.proTemplates.amountLabel}</span>
        <input
          inputMode="numeric"
          value={values.amount}
          onChange={(e) => setValues({ ...values, amount: e.target.value.replace(/\D/g, "") })}
          required
        />
      </label>
      <TextArea
        label={es.proTemplates.noteLabel}
        rows={3}
        maxLength={TEMPLATE_LIMITS.noteMax}
        value={values.note}
        onChange={(e) => setValues({ ...values, note: e.target.value })}
      />
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.proTemplates.saving : es.proTemplates.save}
      </button>
      {onCancel ? (
        <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>
          {es.proTemplates.cancel}
        </button>
      ) : null}
    </form>
  );
}

export function TemplatesManager({ initial, proId }: { initial: QuoteTemplate[]; proId: string }) {
  const [templates, setTemplates] = useState<QuoteTemplate[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function reload() {
    setTemplates(await listTemplates(createSupabaseBrowserClient()));
  }

  async function save(values: FormValues) {
    setError(null);
    const checked = validateTemplate(values);
    if (!checked.ok) return setError(checked.error);
    if (!editingId && templates.length >= MAX_TEMPLATES) return setError(es.proTemplates.limit);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (editingId) await updateTemplate(supabase, editingId, checked.value);
      else await createTemplate(supabase, proId, checked.value);
      await reload();
      setEditingId(null);
      setFormKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : es.proTemplates.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      await deleteTemplate(createSupabaseBrowserClient(), id);
      await reload();
      setConfirmingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : es.proTemplates.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  const editing = templates.find((t) => t.id === editingId) ?? null;

  return (
    <div className="stack">
      {error ? <p className="error" role="alert">{error}</p> : null}

      {templates.length === 0 ? <p className="muted">{es.proTemplates.empty}</p> : null}
      <ul className="list">
        {templates.map((t) => (
          <li key={t.id} className="job-card">
            {editingId === t.id && editing ? (
              <TemplateForm
                key={`edit-${t.id}-${formKey}`}
                initial={{ title: editing.title, amount: String(editing.amount_dop), note: editing.note ?? "" }}
                busy={busy}
                onSubmit={save}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="stack">
                <div className="job-card-top">
                  <strong>{t.title}</strong>
                  <span className="job-card-amount">{money(t.amount_dop)}</span>
                </div>
                {t.note ? <p className="muted">{t.note}</p> : null}
                <div className="template-actions">
                  <button className="button secondary tap" type="button" onClick={() => { setError(null); setConfirmingId(null); setEditingId(t.id); }} disabled={busy}>
                    {es.proTemplates.edit}
                  </button>
                  {confirmingId === t.id ? (
                    <button className="button danger tap" type="button" onClick={() => remove(t.id)} disabled={busy}>
                      {es.proTemplates.confirmDelete}
                    </button>
                  ) : (
                    <button className="button tertiary tap" type="button" onClick={() => setConfirmingId(t.id)} disabled={busy}>
                      {es.proTemplates.delete}
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editingId === null ? (
        <section className="card stack">
          <h2>{es.proTemplates.newTitle}</h2>
          <TemplateForm key={`new-${formKey}`} initial={{ title: "", amount: "", note: "" }} busy={busy} onSubmit={save} />
        </section>
      ) : null}
    </div>
  );
}
