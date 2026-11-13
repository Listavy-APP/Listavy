"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics/consent";
import { buildMyDataExport } from "@/lib/data/export";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function PrivacySettings({ userId }: { userId: string }) {
  // Read the device choice after mount, so server and client render the same first frame.
  const [analytics, setAnalytics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnalytics(getAnalyticsConsent());
  }, []);

  function toggleAnalytics(next: boolean) {
    setAnalyticsConsent(next);
    setAnalytics(next);
  }

  async function downloadData() {
    setError(null);
    setBusy(true);
    try {
      const data = await buildMyDataExport(createSupabaseBrowserClient(), userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "listavy-mis-datos.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : es.settings.exportError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h2>{es.settings.privacyTitle}</h2>
      <p className="muted">{es.settings.privacyIntro}</p>

      <div className="stack">
        <label className="field">
          <span>{es.settings.analyticsLabel}</span>
          <input type="checkbox" checked={analytics} onChange={(e) => toggleAnalytics(e.target.checked)} />
        </label>
        <p className="muted">{es.settings.analyticsHint}</p>
      </div>

      <div className="stack">
        <h3>{es.settings.locationTitle}</h3>
        <p className="muted">{es.settings.locationHint}</p>
      </div>

      <div className="stack">
        <h3>{es.settings.exportTitle}</h3>
        <p className="muted">{es.settings.exportHint}</p>
        <button className="button secondary" type="button" disabled={busy} onClick={downloadData}>
          {busy ? es.settings.exporting : es.settings.exportButton}
        </button>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>

      <div className="stack">
        <h3>{es.settings.deleteTitle}</h3>
        <p className="muted">{es.settings.deleteHint}</p>
        <Link className="button secondary" href="/cuenta#eliminar">{es.settings.deleteLink}</Link>
      </div>

      <p className="muted"><Link href="/privacidad">{es.settings.privacyLink}</Link></p>
    </section>
  );
}
