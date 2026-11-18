"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics/consent";
import { buildMyDataExport } from "@/lib/data/export";
import { es } from "@/lib/i18n/es";
import { Switch } from "@/components/Switch";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function PrivacySettings({ userId }: { userId: string }) {
  // Read the device choice after mount, so server and client render the same first frame.
  const [analytics, setAnalytics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reads the device consent after mount, so the server and first client render match.
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

      <div className="hub-group">
        <div className="settings-row">
          <span>{es.settings.analyticsLabel}</span>
          <Switch checked={analytics} onChange={toggleAnalytics} label={es.settings.analyticsLabel} />
        </div>
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

      <p className="muted"><Link href="/privacidad">{es.settings.privacyLink}</Link></p>
    </section>
  );
}
