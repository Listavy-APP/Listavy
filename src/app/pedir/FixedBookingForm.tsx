"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Choice } from "@/components/ui/Choice";
import { TextArea } from "@/components/ui/TextArea";
import { MunicipalityPicker } from "@/components/MunicipalityPicker";
import { createFixedBooking } from "@/lib/data/fixed";
import type { Municipality } from "@/lib/data/municipalities";
import type { PublicFixedService } from "@/lib/domain/fixed-service";
import { CITIES, ZONES_BY_CITY } from "@/lib/domain/catalog";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SCHEDULE_WINDOWS, maxScheduleDate, santoDomingoToday, scheduleProblem, type ScheduleWindow } from "@/lib/domain/schedule";

/** Fixed-price booking with one pro (0116). The database creates the job and the quote at the catalog price. */
export function FixedBookingForm(props: {
  pro: { id: string; name: string | null; zone: string };
  services: PublicFixedService[];
  preselectedId: string | null;
  municipalities: Municipality[];
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(props.preselectedId ?? "");
  const [municipalityId, setMunicipalityId] = useState("");
  const [zone, setZone] = useState(props.pro.zone);
  const [scheduleMode, setScheduleMode] = useState<"asap" | "dated">("asap");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleWindow, setScheduleWindow] = useState<ScheduleWindow | "">("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const service = props.services.find((s) => s.id === serviceId) ?? null;
  const sectorSuggestions = CITIES.flatMap((c) => ZONES_BY_CITY[c] as readonly string[]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!service) return setError(es.fixed.needService);
    const schedDate = scheduleMode === "dated" ? scheduleDate : null;
    const schedWindow = scheduleMode === "dated" ? scheduleWindow || null : null;
    const problem = scheduleProblem(schedDate, schedWindow);
    if (problem) return setError(es.schedule.problems[problem]);
    if (!municipalityId) return setError("Elige el municipio donde necesitas el servicio.");
    if (zone.trim().length < 2) return setError(es.fixed.needZone);

    setBusy(true);
    try {
      const jobId = await createFixedBooking(createSupabaseBrowserClient(), {
        serviceId: service.id,
        proId: props.pro.id,
        zone: zone.trim(),
        description: description.trim() || null,
        municipalityId,
        scheduledDate: schedDate,
        scheduledWindow: schedWindow,
      });
      router.push(`/trabajos/${jobId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.fixed.failed);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h1>{es.fixed.modePrice}</h1>
      <p className="muted">{es.fixed.modeHint}</p>
      <p>
        <b>{props.pro.name ?? "—"}</b>
      </p>

      <fieldset className="stack">
        <legend>{es.fixed.pickService}</legend>
        {props.services.map((s) => (
          <label key={s.id} className="panel" style={{ display: "flex", gap: 12, alignItems: "flex-start", minHeight: 44 }}>
            <input
              type="radio"
              name="fixedService"
              value={s.id}
              checked={serviceId === s.id}
              onChange={() => setServiceId(s.id)}
              disabled={busy}
              style={{ marginTop: 4 }}
            />
            <span className="stack">
              <b>
                {s.name_es} · {es.money.dop(s.price_dop)}
              </b>
              <span className="muted">
                {es.fixed.includesLabel}: {s.includes_es}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <MunicipalityPicker
        municipalities={props.municipalities}
        value={municipalityId}
        onChange={setMunicipalityId}
        label="Municipio"
        required
      />

      <label className="field">
        <span>{es.jobs.zoneLabel}</span>
        <input name="zone" list="fixed-sector-suggestions" value={zone} onChange={(e) => setZone(e.target.value)} required minLength={2} maxLength={60} style={{ minHeight: 44 }} disabled={busy} />
        <datalist id="fixed-sector-suggestions">
          {sectorSuggestions.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>

      <Choice
        legend={es.schedule.question}
        name="fixedScheduleMode"
        value={scheduleMode}
        options={[
          { value: "asap", label: es.schedule.asap },
          { value: "dated", label: es.schedule.dated },
        ]}
        onChange={setScheduleMode}
        disabled={busy}
      />
      {scheduleMode === "dated" ? (
        <>
          <label className="field">
            <span>{es.schedule.dateLabel}</span>
            <input type="date" value={scheduleDate} min={santoDomingoToday()} max={maxScheduleDate()} onChange={(e) => setScheduleDate(e.target.value)} disabled={busy} />
          </label>
          <Choice
            legend={es.schedule.windowLabel}
            name="fixedScheduleWindow"
            value={scheduleWindow}
            options={SCHEDULE_WINDOWS.map((w) => ({ value: w, label: es.schedule.windows[w] }))}
            onChange={setScheduleWindow}
            disabled={busy}
          />
        </>
      ) : null}
      <p className="muted">{es.schedule.hint}</p>

      <TextArea label={es.fixed.descriptionOptional} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />

      {service ? (
        <div className="panel stack" role="status">
          <b>{es.fixed.confirmTitle}</b>
          <p>
            {service.name_es}: <b>{es.money.dop(service.price_dop)}</b>
          </p>
          <p className="muted">
            {es.fixed.includesLabel}: {service.includes_es}
          </p>
          <p className="muted">{es.fixed.includesNote}</p>
          <p className="muted">{es.fixed.confirmBody}</p>
        </div>
      ) : null}

      <button className="button" type="submit" disabled={busy || !service}>
        {busy ? es.fixed.submitting : es.fixed.submit}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
