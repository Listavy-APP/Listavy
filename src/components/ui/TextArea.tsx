import type { TextareaHTMLAttributes } from "react";

/** Labelled multi-line field. Styling comes from `.field textarea`. */
export function TextArea({
  label,
  hint,
  rows = 4,
  ...rest
}: { label: string; hint?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} {...rest} />
      {hint ? <span className="muted">{hint}</span> : null}
    </label>
  );
}
