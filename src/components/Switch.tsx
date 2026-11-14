/**
 * iOS-style on/off switch (UI phase §5). A real button with role="switch",
 * so screen readers get the state and the label comes from the row text.
 */
export function Switch(props: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className="switch"
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="switch-knob" aria-hidden="true" />
    </button>
  );
}
