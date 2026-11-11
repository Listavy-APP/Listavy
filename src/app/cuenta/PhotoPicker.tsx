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
      <div className="row">
        <Avatar name={props.name} src={props.photoUrl} />
        <div className="stack">
          <label className="file-pick">
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPick(f);
                e.target.value = "";
              }}
            />
            <span>{es.profile.photoChoose}</span>
          </label>
          {props.photoPath ? (
            <button className="button secondary" type="button" disabled={busy} onClick={onRemove}>
              {es.profile.photoRemove}
            </button>
          ) : null}
        </div>
      </div>
      <p className="muted">{es.profile.photoHint}</p>
      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
