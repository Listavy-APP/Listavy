"use client";

import { useEffect, useMemo } from "react";
import { es } from "@/lib/i18n/es";

/**
 * File picker in the app's own style: an outlined button, image previews for
 * image pickers, and a designed placeholder until a file is chosen.
 */
export function FilePick(props: {
  label: string;
  hint?: string;
  buttonLabel: string;
  accept: string;
  capture?: "environment";
  multiple?: boolean;
  disabled?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  /** Thumbnails for work and profile photos. Identity documents pass false: file names only. */
  preview?: boolean;
}) {
  const isImage = props.accept.includes("image");
  const showThumbs = isImage && (props.preview ?? true);

  // Object URLs for previews. Revoked when the selection changes or the field unmounts.
  const previews = useMemo(
    () => (showThumbs ? props.files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })) : []),
    [showThumbs, props.files],
  );
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const count = props.files.length;

  return (
    <div className="file">
      <span className="field-label">{props.label}</span>
      <label className="file-pick">
        <input
          className="sr-only"
          type="file"
          accept={props.accept}
          capture={props.capture}
          multiple={props.multiple}
          disabled={props.disabled}
          onChange={(e) => props.onFiles(Array.from(e.target.files ?? []))}
        />
        <span>{props.buttonLabel}</span>
      </label>

      {showThumbs ? (
        count > 0 ? (
          <div className="file-previews">
            {previews.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.url} className="file-thumb" src={p.url} alt={p.name} />
            ))}
          </div>
        ) : (
          <div className="file-empty" aria-hidden="true">
            {es.common.noFile}
          </div>
        )
      ) : (
        <span className="file-name">{count > 0 ? props.files.map((f) => f.name).join(", ") : es.common.noFile}</span>
      )}

      {showThumbs && count > 0 ? <span className="file-name">{es.common.photosChosenCount(count)}</span> : null}
      {props.hint ? <p className="muted">{props.hint}</p> : null}
    </div>
  );
}
