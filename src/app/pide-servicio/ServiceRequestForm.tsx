"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { MunicipalityPicker } from "@/components/MunicipalityPicker";
import type { Municipality } from "@/lib/data/municipalities";

type Props = {
  trades: { key: string; label: string }[];
  municipalities: Municipality[];
  initialTrade: string;
  initialMunicipality: string;
  signedIn: boolean;
  initialName: string;
  initialPhone: string;
  loginNext: string;
};

const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;

/** Sign-in is required. An anonymous submit routes through login and returns here. */
export function ServiceRequestForm(p: Props) {
  const router = useRouter();
  const [trade, setTrade] = useState(p.initialTrade);
  const [municipalityId, setMunicipalityId] = useState(p.initialMunicipality);
  const [name, setName] = useState(p.initialName);
  const [phone, setPhone] = useState(p.initialPhone);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!p.signedIn) {
      router.push(`/login?next=${encodeURIComponent(p.loginNext)}`);
      return;
    }
    setError(null);
    if (!trade) return setError("Elige el servicio.");
    if (!municipalityId) return setError("Elige el municipio.");
    if (name.trim().length < 2) return setError("Escribe tu nombre.");
    if (!PHONE_PATTERN.test(phone.trim())) return setError("Escribe un teléfono válido.");
    if (note.length > 500) return setError("La nota puede tener hasta 500 caracteres.");

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // requester_id defaults to the signed-in user in the database; it is not sent.
      const { error: err } = await supabase.from("service_requests").insert({
        trade,
        municipality_id: municipalityId,
        full_name: name.trim(),
        phone: phone.trim(),
        note: note.trim() || null,
      });
      if (err) throw err;
      setSent(true);
    } catch {
      setError("No pudimos enviar tu pedido. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p role="status">Recibimos tu pedido. Te avisamos cuando haya un profesional para tu servicio.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <label className="field">
        <span>Servicio</span>
        <select value={trade} onChange={(e) => setTrade(e.target.value)} required style={{ minHeight: 44 }}>
          <option value="">Elige servicio</option>
          {p.trades.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <MunicipalityPicker
        municipalities={p.municipalities}
        value={municipalityId}
        onChange={setMunicipalityId}
        label="Municipio"
        required
      />

      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" style={{ minHeight: 44 }} />
      </label>

      <label className="field">
        <span>Teléfono</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" style={{ minHeight: 44 }} />
      </label>

      <label className="field">
        <span>Nota (opcional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
      </label>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <button type="submit" className="btn" disabled={busy} style={{ minHeight: 44 }}>
        {p.signedIn ? (busy ? "Enviando…" : "Enviar pedido") : "Inicia sesión para enviar"}
      </button>
    </form>
  );
}
