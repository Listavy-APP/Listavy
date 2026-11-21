"use client";

import { useMemo, useState } from "react";
import { groupByProvince, type Municipality } from "@/lib/data/municipalities";

type Props = {
  municipalities: readonly Municipality[];
  /** Municipality id. Controlled by the parent so it can prefill. */
  value: string;
  onChange: (municipalityId: string) => void;
  /** Form field name for native submit, when the parent uses FormData. */
  name?: string;
  label: string;
  required?: boolean;
};

/** Province first, then municipality. Two selects, 44px touch targets. */
export function MunicipalityPicker({ municipalities, value, onChange, name, label, required }: Props) {
  const byProvince = useMemo(() => groupByProvince(municipalities), [municipalities]);
  const initialProvince = municipalities.find((m) => m.id === value)?.province ?? "";
  const [province, setProvince] = useState(initialProvince);
  const provinceNames = [...byProvince.keys()];
  const options = province ? (byProvince.get(province) ?? []) : [];

  return (
    <div className="row">
      <label className="field">
        <span>Provincia</span>
        <select
          value={province}
          required={required}
          onChange={(e) => {
            setProvince(e.target.value);
            onChange("");
          }}
          style={{ minHeight: 44 }}
        >
          <option value="">Elige provincia</option>
          {provinceNames.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{label}</span>
        <select
          name={name}
          value={value}
          required={required}
          disabled={!province}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 44 }}
        >
          <option value="">{province ? "Elige municipio" : "Primero elige provincia"}</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
