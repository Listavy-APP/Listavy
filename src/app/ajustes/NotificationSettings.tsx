"use client";

import { useState } from "react";
import { DeviceSwitch } from "./DeviceSwitch";
import { Switch } from "@/components/Switch";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Prefs = { job_push: boolean; job_email: boolean };

/** Job-event push and email toggles (0091). Defaults ON. Receipts and dispute emails always send. */
export function NotificationSettings({
  userId,
  initial,
  emailVerified,
}: {
  userId: string;
  initial: Prefs;
  emailVerified: boolean;
}) {
  const t = es.notifSettings;
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function change(next: Prefs) {
    const previous = prefs;
    setPrefs(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { error: err } = await createSupabaseBrowserClient()
        .from("notification_preferences")
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (err) throw err;
      setSaved(true);
    } catch {
      setPrefs(previous);
      setError(t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h2>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <div className="settings-row">
        <span>{t.jobPushLabel}</span>
        <Switch
          checked={prefs.job_push}
          onChange={(v) => change({ ...prefs, job_push: v })}
          label={t.jobPushLabel}
          disabled={busy}
        />
      </div>
      <p className="muted">{t.jobPushHint}</p>
      <div className="settings-row">
        <span>{t.jobEmailLabel}</span>
        <Switch
          checked={prefs.job_email}
          onChange={(v) => change({ ...prefs, job_email: v })}
          label={t.jobEmailLabel}
          disabled={busy || !emailVerified}
        />
      </div>
      <p className="muted">{t.jobEmailHint}</p>
      {!emailVerified ? <p className="muted">{t.unverified}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {saved ? <p className="muted" role="status">{t.saved}</p> : null}

      <DeviceSwitch />
    </div>
  );
}
