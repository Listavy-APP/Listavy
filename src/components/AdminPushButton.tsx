"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks an admin to turn on push. If denied, nothing is sent and the bell still works. */
export function AdminPushButton() {
  const [state, setState] = useState<"checking" | "unsupported" | "granted" | "available" | "denied" | "saving" | "error">("checking");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !VAPID_PUBLIC_KEY) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Detects browser push support after mount, so the server and first client render match.
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => {
        setState(sub ? "granted" : "available");
      });
      return;
    }
    setState("available");
  }, []);

  async function enable() {
    setState("saving");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "available");

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
      setState("granted");
    } catch {
      setState("error");
    }
  }

  if (state === "unsupported" || state === "checking" || state === "granted" || state === "denied") {
    return state === "granted" ? <p className="muted">Notificaciones activadas.</p> : null;
  }
  return (
    <div className="stack">
      <button className="button secondary" type="button" onClick={enable} disabled={state === "saving"}>
        Activar notificaciones
      </button>
      {state === "error" ? <p className="muted">No se pudieron activar. Intenta de nuevo.</p> : null}
    </div>
  );
}
