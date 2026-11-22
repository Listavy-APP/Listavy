"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CITIES, ZONES_BY_CITY } from "@/lib/domain/catalog";
import { PRICE_UNITS, isPriceUnit, type PriceUnit } from "@/lib/domain/price-unit";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Price range, unit and zone. Writes only through pro_update_pricing_zone (0103, unit 0115); the city follows the zone. */
export function PricingZoneForm({
  initialMin,
  initialMax,
  initialZone,
  initialUnit,
}: {
  initialMin: number;
  initialMax: number;
  initialZone: string;
  initialUnit: PriceUnit;
}) {
  const router = useRouter();
  const [min, setMin] = useState(String(initialMin));
  const [max, setMax] = useState(String(initialMax));
  const [zone, setZone] = useState(initialZone);
  const [unit, setUnit] = useState<PriceUnit>(initialUnit);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const priceMin = Number(min);
    const priceMax = Number(max);
    // Same rules as registration: whole pesos, min >= 0, max >= min.
    if (!Number.isInteger(priceMin) || !Number.isInteger(priceMax) || priceMin < 0 || priceMax < priceMin) {
      setError(es.proPricingForm.invalidPrice);
      return;
    }
    if (!isPriceUnit(unit)) {
      setError(es.priceUnit.needUnit);
      return;
    }
    const allZones = CITIES.flatMap((c) => ZONES_BY_CITY[c] as readonly string[]);
    if (!allZones.includes(zone)) {
      setError(es.proPricingForm.invalidZone);
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.rpc("pro_update_pricing_zone", {
        p_price_min: priceMin,
        p_price_max: priceMax,
        p_zone: zone,
        // Municipality is not editable here yet; null keeps the current one (0111 signature).
        p_municipality_id: null,
        p_price_unit: unit,
      });
      if (err) throw err;
      setSaved(true);
      router.refresh();
    } catch {
      setError(es.proPricingForm.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="precios-zona" className="stack" onSubmit={onSubmit} noValidate>
      <h2>{es.proPricingForm.title}</h2>
      <p className="muted">{es.proPricingForm.intro}</p>
      <p className="muted">{es.priceUnit.explainer}</p>
      <label className="field">
        {es.proPricingForm.priceMin}
        <input type="number" inputMode="numeric" min={0} step={1} value={min} onChange={(e) => setMin(e.target.value)} />
      </label>
      <label className="field">
        {es.proPricingForm.priceMax}
        <input type="number" inputMode="numeric" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)} />
      </label>
      <label className="field">
        {es.priceUnit.label}
        <select value={unit} onChange={(e) => setUnit(e.target.value as PriceUnit)}>
          {PRICE_UNITS.map((u) => (
            <option key={u} value={u}>
              {es.priceUnit[u]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {es.proPricingForm.zone}
        <select value={zone} onChange={(e) => setZone(e.target.value)}>
          {CITIES.map((c) => (
            <optgroup key={c} label={es.cities[c]}>
              {(ZONES_BY_CITY[c] as readonly string[]).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button className="button" type="submit" disabled={busy}>
        {es.proPricingForm.save}
      </button>
      {saved ? <p className="ok" role="status">{es.proPricingForm.saved}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
