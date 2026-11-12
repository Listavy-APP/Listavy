import { es } from "@/lib/i18n/es";

/** File picker in the app's own style: an outlined button, the chosen file names below it. */
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
}) {
  const names = props.files.map((f) => f.name).join(", ");
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
      <span className="file-name">{names || es.common.noFile}</span>
      {props.hint ? <p className="muted">{props.hint}</p> : null}
    </div>
  );
}
