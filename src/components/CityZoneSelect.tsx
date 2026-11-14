"use client";

import { useState } from "react";
import { CITIES, DEFAULT_CITY, ZONES_BY_CITY, cityOfZone, type City } from "@/lib/domain/catalog";
import { es } from "@/lib/i18n/es";

/**
 * City, then zone. The zone list follows the city. Pick the city first.
 * allZonesLabel: adds an "all zones" option (search). placeholder: adds a disabled "—" (forms).
 */
export function CityZoneSelect(props: {
  cityName: string;
  zoneName: string;
  zoneLabel: string;
  defaultCity?: City;
  defaultZone?: string;
  allZonesLabel?: string;
  placeholder?: boolean;
  onChange?: (city: City, zone: string) => void;
}) {
  const fromDefault = props.defaultZone ? cityOfZone(props.defaultZone) : null;
  const [city, setCity] = useState<City>(fromDefault ?? props.defaultCity ?? DEFAULT_CITY);
  const [zone, setZone] = useState<string>(fromDefault ? props.defaultZone ?? "" : "");

  const resetZone = (next: City) => {
    if (props.allZonesLabel !== undefined || props.placeholder) return "";
    return ZONES_BY_CITY[next][0];
  };

  function pickCity(next: City) {
    const z = resetZone(next);
    setCity(next);
    setZone(z);
    props.onChange?.(next, z);
  }

  function pickZone(z: string) {
    setZone(z);
    props.onChange?.(city, z);
  }

  return (
    <>
      <label className="field">
        <span>{es.cityUi.label}</span>
        <select name={props.cityName} value={city} onChange={(e) => pickCity(e.target.value as City)}>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {es.cities[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{props.zoneLabel}</span>
        <select name={props.zoneName} value={zone} onChange={(e) => pickZone(e.target.value)}>
          {props.allZonesLabel !== undefined ? (
            <option value="">{props.allZonesLabel}</option>
          ) : props.placeholder ? (
            <option value="" disabled>
              —
            </option>
          ) : null}
          {ZONES_BY_CITY[city].map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
