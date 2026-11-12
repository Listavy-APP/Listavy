/** One-of-many choice in the app's own style. Replaces native radio buttons everywhere. */
export function Choice<T extends string>(props: {
  legend: string;
  name: string;
  value: T | "";
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend>{props.legend}</legend>
      <div className="choice-group">
        {props.options.map((o) => (
          <label key={o.value} className={`choice${props.value === o.value ? " on" : ""}`}>
            <input
              className="sr-only"
              type="radio"
              name={props.name}
              value={o.value}
              checked={props.value === o.value}
              disabled={props.disabled}
              onChange={() => props.onChange(o.value)}
            />
            <span className="choice-mark" aria-hidden="true" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
