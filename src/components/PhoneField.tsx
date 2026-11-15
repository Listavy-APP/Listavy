import { PHONE_COUNTRIES } from "@/lib/domain/countries";

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
  placeholder,
}: {
  label: string;
  countryLabel: string;
  country: string;
  local: string;
  onCountry: (code: string) => void;
  onLocal: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="stack">
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
          placeholder={placeholder}
          value={local}
          onChange={(e) => onLocal(e.target.value)}
          required
        />
      </label>
    </div>
  );
}
