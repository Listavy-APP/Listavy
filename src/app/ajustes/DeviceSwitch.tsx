"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/Switch";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "checking" | "unsupported" | "blocked" | "off" | "on" | "saving" | "error";

/**
 * "Este dispositivo" switch for this browser's push subscription (Ajustes only).
 * A fork of AdminPushButton: that component stays on the admin page unchanged.
 * ON runs permission, subscribe and upsert. OFF deletes this endpoint's row and unsubscribes.
 */
export function DeviceSwitch() {
  const t = es.notifSettings;
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !VAPID_PUBLIC_KEY) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Detects browser push support after mount, so the server and first client render match.
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    // Reads the real subscription of this browser, so the switch matches what the device receives.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("error"));
  }, []);

  async function turnOn() {
    setState("saving");
    try {
      const permission = await Notification.requestPermission();
      // Dismissed or denied: the switch goes back to OFF.
      if (permission === "denied") return setState("blocked");
      if (permission !== "granted") return setState("off");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      const supabase = createSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Suscripción incompleta.");

      const { error } = await supabase.from("push_subscriptions").upsert(
        { user_id: userData.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
      setState("on");
    } catch {
      setState("error");
    }
  }

  async function turnOff() {
    setState("saving");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Row first: if the delete fails, the device keeps its subscription and the switch stays ON.
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        if (error) throw new Error(error.message);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  }

  const busy = state === "checking" || state === "saving" || state === "unsupported" || state === "blocked";
  return (
    <>
      <div className="settings-row">
        <span>{t.deviceTitle}</span>
        <Switch
          checked={state === "on"}
          onChange={(v) => (v ? turnOn() : turnOff())}
          label={t.deviceTitle}
          disabled={busy}
        />
      </div>
      <p className="muted">{t.deviceHint}</p>
      {state === "unsupported" ? <p className="muted">{t.deviceUnsupported}</p> : null}
      {state === "blocked" ? <p className="muted">{t.deviceBlocked}</p> : null}
      {state === "error" ? <p className="error" role="alert">{t.deviceError}</p> : null}
    </>
  );
}
