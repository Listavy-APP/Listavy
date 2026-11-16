"use client";

import { useEffect, useState } from "react";
import { es } from "@/lib/i18n/es";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

/**
 * "Instala Listavy" banner. Chrome and Android: uses the browser install prompt.
 * iOS Safari has no prompt, so it shows the steps. Hidden when already installed or dismissed.
 */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      setShowIos(true);
      setHidden(false);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
    setHidden(true);
  }

  return (
    <section className="install-banner" aria-label={es.discover.installTitle}>
      <div>
        <strong>{es.discover.installTitle}</strong>
        <p className="muted">{showIos && !deferred ? es.discover.installIos : es.discover.installSub}</p>
      </div>
      {deferred ? (
        <button className="button" type="button" onClick={install}>
          {es.discover.installButton}
        </button>
      ) : null}
    </section>
  );
}
