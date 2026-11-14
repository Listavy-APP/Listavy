"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { es } from "@/lib/i18n/es";
import { squareJpeg } from "@/lib/media/square";
import { removeCustomerPhoto, uploadCustomerPhoto } from "@/lib/storage/customerFiles";
import { setCustomerAvatar } from "@/lib/data/profiles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAX_BYTES = 2 * 1024 * 1024;

export function PhotoPicker(props: {
  userId: string;
  name: string | null;
  photoUrl: string | null;
  photoPath: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function onPick(file: File) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const blob = await squareJpeg(file);
      if (blob.size > MAX_BYTES) throw new Error(es.profile.photoTooBig);
      const path = await uploadCustomerPhoto(supabase, props.userId, blob);
      await setCustomerAvatar(supabase, props.userId, path);
      if (props.photoPath) await removeCustomerPhoto(supabase, props.photoPath);
      setMessage(es.profile.photoSaved);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!props.photoPath) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await setCustomerAvatar(supabase, props.userId, null);
      await removeCustomerPhoto(supabase, props.photoPath);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="photo-row">
        <button
          type="button"
          className="photo-edit"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-label={es.profile.photoChoose}
          disabled={busy}
          onClick={() => setSheetOpen(true)}
        >
          <Avatar name={props.name} src={props.photoUrl} />
          <span className="photo-badge" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
        </button>
      </div>
      {sheetOpen ? (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={es.profile.photoChoose} onClick={(e) => e.stopPropagation()}>
            <label className="sheet-action">
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setSheetOpen(false);
                  if (f) void onPick(f);
                  e.target.value = "";
                }}
              />
              {es.profile.photoChoose}
            </label>
            {props.photoPath ? (
              <button
                type="button"
                className="sheet-action danger"
                disabled={busy}
                onClick={() => {
                  setSheetOpen(false);
                  void onRemove();
                }}
              >
                {es.profile.photoRemove}
              </button>
            ) : null}
            <button type="button" className="sheet-action" onClick={() => setSheetOpen(false)}>
              {es.addresses.cancel}
            </button>
          </div>
        </div>
      ) : null}
      <p className="muted">{es.profile.photoHint}</p>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
