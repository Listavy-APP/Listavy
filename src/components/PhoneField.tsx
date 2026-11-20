import { PHONE_COUNTRIES, phonePlaceholder } from "@/lib/domain/countries";

/**
 * Country code select plus a local number field. The parent composes the value with composePhone().
 * Used at sign-in and on phone change, so both accept the same countries.
 */
export function PhoneField({
  label,
  countryLabel,
  country,
  local,
  onCountry,
  onLocal,
  error,
  errorId,
}: {
  label: string;
  countryLabel: string;
  country: string;
  local: string;
  onCountry: (code: string) => void;
  onLocal: (value: string) => void;
  /** Validation error for the number. Linked to the number input and to the group, so it is announced on the field. */
  error?: string | null;
  errorId?: string;
}) {
  return (
    <div className="stack" role="group" aria-describedby={error && errorId ? errorId : undefined}>
      <label className="field">
        <span>{countryLabel}</span>
        <select value={country} onChange={(e) => onCountry(e.target.value)}>
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{label}</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={phonePlaceholder(country)}
          value={local}
          onChange={(e) => onLocal(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
        />
      </label>
      {error && errorId ? <p id={errorId} className="error" role="alert">{error}</p> : null}
    </div>
  );
}
