"use client";

import { useRouter } from "next/navigation";
import { ClaimReferral } from "@/components/ClaimReferral";
import { useRef, useState, type FormEvent } from "react";
import { LocationConsent } from "@/components/LocationConsent";
import { Choice } from "@/components/ui/Choice";
import { FilePick } from "@/components/ui/FilePick";
import { TextArea } from "@/components/ui/TextArea";
import { createJobRequest, setLocationConsent, uploadJobFile, type JobType, type RequestedType } from "@/lib/data/jobs";
import { es } from "@/lib/i18n/es";
import { proLabelOf, type CatalogTrade } from "@/lib/data/trades";
import { resizeImage } from "@/lib/media/resize";
import { CITIES, ZONES_BY_CITY } from "@/lib/domain/catalog";
import { MunicipalityPicker } from "@/components/MunicipalityPicker";
import type { Property } from "@/lib/data/properties";
import type { Municipality } from "@/lib/data/municipalities";
import { formatRange, type PriceGuide } from "@/lib/domain/price-guides";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SCHEDULE_WINDOWS, maxScheduleDate, santoDomingoToday, scheduleProblem, type ScheduleWindow } from "@/lib/domain/schedule";
import { isUrgentScheduleAllowed } from "@/lib/domain/urgent";

type ProOption = { id: string; name: string | null; trade: string; zone: string; pro_type: "individual" | "company" };

export function RequestForm(props: { userId: string; pros: ProOption[]; guide?: PriceGuide | null; trades: Record<string, CatalogTrade>; municipalities: Municipality[]; properties: Property[]; urgentFeeDop: number | null }) {
  const router = useRouter();
  const trade = props.pros[0].trade;
  const sameTrade = props.pros.every((p) => p.trade === trade);

  const [zone, setZone] = useState<string>(props.pros[0].zone);
  const [municipalityId, setMunicipalityId] = useState("");
  // B2B property (0119). A chosen property sets the place; the database re-checks it.
  const [propertyId, setPropertyId] = useState("");
  const chosenProperty = props.properties.find((x) => x.id === propertyId) ?? null;
  const sectorSuggestions = CITIES.flatMap((c) => ZONES_BY_CITY[c] as readonly string[]);
  const [jobType, setJobType] = useState<JobType>("repair");
  // Person / company choice (Phase 1). The server refuses a pro of the other type.
  const [requestedType, setRequestedType] = useState<RequestedType>("any");
  // Pros whose type does not match the choice. The server refuses them too; this stops the request early.
  const mismatched = requestedType === "any" ? [] : props.pros.filter((p) => p.pro_type !== requestedType);
  // Scheduling. "Lo antes posible" is preselected, so the choice adds no extra step by default.
  const [scheduleMode, setScheduleMode] = useState<"asap" | "dated">("asap");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleWindow, setScheduleWindow] = useState<ScheduleWindow | "">("");
  // Urgent lane (0117). Urgent means today: the date is locked to today, or ASAP.
  const [urgencyMode, setUrgencyMode] = useState<"normal" | "urgent">("normal");
  const urgent = urgencyMode === "urgent";
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const uploaded = useRef(new Map<File, string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!sameTrade) return setError(es.jobs.sameTradeHint);
    if (mismatched.length > 0) return setError(es.typeRouting.mismatch);
    const schedDate = scheduleMode === "dated" ? scheduleDate : null;
    const schedWindow = scheduleMode === "dated" ? scheduleWindow || null : null;
    const schedProblem = scheduleProblem(schedDate, schedWindow);
    if (schedProblem) return setError(es.schedule.problems[schedProblem]);
    if (urgent && !isUrgentScheduleAllowed(schedDate, santoDomingoToday())) return setError(es.urgent.dateToday);
    if (description.trim().length < 20) return setError(es.jobs.descriptionShort);
    if (photos.length < 1) return setError(es.jobs.photoRequired);
    // Place is the municipality the client picks (0111). No city gate: the client chooses the pro.
    const placeId = chosenProperty ? chosenProperty.municipality_id : municipalityId;
    if (!placeId) return setError("Elige el municipio donde necesitas el servicio.");
    if (zone.trim().length < 2) return setError(es.jobs.zoneLabel);

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // Files that already uploaded in a failed attempt are reused, so a retry adds no duplicates.
      const photoPaths: string[] = [];
      for (const file of photos) {
        let path = uploaded.current.get(file);
        if (!path) {
          const blob = await resizeImage(file);
          path = await uploadJobFile(supabase, props.userId, blob, "jpg");
          uploaded.current.set(file, path);
        }
        photoPaths.push(path);
      }
      let voicePath: string | null = null;
      if (voice) {
        voicePath = uploaded.current.get(voice) ?? null;
        if (!voicePath) {
          const ext = voice.name.split(".").pop() || "m4a";
          voicePath = await uploadJobFile(supabase, props.userId, voice, ext);
          uploaded.current.set(voice, voicePath);
        }
      }
      const jobId = await createJobRequest(supabase, {
        trade,
        zone: zone.trim(),
        municipalityId: placeId,
        propertyId: chosenProperty?.id ?? null,
        description: description.trim(),
        jobType,
        proIds: props.pros.map((p) => p.id),
        photoPaths,
        voicePath,
        requestedProType: requestedType,
        scheduledDate: schedDate,
        scheduledWindow: schedWindow,
        urgent,
      });
      setCreatedJobId(jobId);
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : es.jobs.genericError);
      setBusy(false);
    }
  }

  if (createdJobId) {
    // Location is off unless the homeowner allows it. The choice is saved before the job opens.
    return (
      <>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <LocationConsent
          onChoose={async (allowed) => {
            setError(null);
            try {
              await setLocationConsent(createSupabaseBrowserClient(), createdJobId, allowed);
              router.push(`/trabajos/${createdJobId}`);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : es.jobs.genericError);
            }
          }}
        />
      </>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h1>{es.jobs.requestTitle}</h1>
      {props.guide && sameTrade ? (
        <div className="panel stack">
          <p>
            <b>
              {es.priceGuide.typical}: {formatRange(props.guide.low, props.guide.high, es.money.dop)}
            </b>
          </p>
          <p className="muted">{es.priceGuide.basedOn(props.guide.sample)}</p>
        </div>
      ) : null}
      <ClaimReferral track="client" />
      <ul className="list">
        {props.pros.map((p) => (
          <li key={p.id}>
            <strong>{p.name ?? "—"}</strong> · {proLabelOf(props.trades, p.trade)}
          </li>
        ))}
      </ul>
      <p className="muted">{props.pros.length === 1 ? es.jobs.oneQuoteHint : es.jobs.manyQuotesHint(props.pros.length)}</p>

      {props.properties.length > 0 ? (
        <label className="field">
          <span>{es.properties.picker}</span>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">{es.properties.pickerNone}</option>
            {props.properties.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <span className="muted">{es.properties.pickerHint}</span>
        </label>
      ) : null}

      {chosenProperty ? null : (
        <MunicipalityPicker
          municipalities={props.municipalities}
          value={municipalityId}
          onChange={setMunicipalityId}
          label="Municipio"
          required
        />
      )}

      <label className="field">
        <span>{es.jobs.zoneLabel}</span>
        <input name="zone" list="job-sector-suggestions" value={zone} onChange={(e) => setZone(e.target.value)} required minLength={2} maxLength={60} style={{ minHeight: 44 }} />
        <datalist id="job-sector-suggestions">
          {sectorSuggestions.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>

      <Choice
        legend={es.jobs.typeLabel}
        name="jobType"
        value={jobType}
        options={[
          { value: "repair", label: es.jobs.typeRepair },
          { value: "diagnostic", label: es.jobs.typeDiagnostic },
        ]}
        onChange={setJobType}
      />
      <p className="muted">{jobType === "diagnostic" ? es.jobs.diagnosticHint : es.jobs.repairHint}</p>

      <Choice
        legend={es.typeRouting.requestLabel}
        name="requestedType"
        value={requestedType}
        options={[
          { value: "any", label: es.typeRouting.any },
          { value: "individual", label: es.typeRouting.person },
          { value: "company", label: es.typeRouting.company },
        ]}
        onChange={setRequestedType}
      />
      <p className="muted">{es.typeRouting.hints[requestedType]}</p>
      {mismatched.length > 0 ? (
        <p className="error" role="alert">
          {es.typeRouting.mismatch} {mismatched.map((p) => p.name ?? "—").join(", ")}
        </p>
      ) : null}

      {props.urgentFeeDop !== null ? (
        <>
          <Choice
            legend={es.urgent.question}
            name="urgencyMode"
            value={urgencyMode}
            options={[
              { value: "normal", label: es.urgent.normal },
              { value: "urgent", label: es.urgent.urgent },
            ]}
            onChange={setUrgencyMode}
            disabled={busy}
          />
          {urgent ? (
            <p className="muted">
              {es.urgent.hint} {es.urgent.feeChoice(props.urgentFeeDop)}
            </p>
          ) : null}
        </>
      ) : null}

      <Choice
        legend={es.schedule.question}
        name="scheduleMode"
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
            <input
              type="date"
              value={scheduleDate}
              min={santoDomingoToday()}
              max={urgent ? santoDomingoToday() : maxScheduleDate()}
              onChange={(e) => setScheduleDate(e.target.value)}
              disabled={busy}
            />
          </label>
          <Choice
            legend={es.schedule.windowLabel}
            name="scheduleWindow"
            value={scheduleWindow}
            options={SCHEDULE_WINDOWS.map((w) => ({ value: w, label: es.schedule.windows[w] }))}
            onChange={setScheduleWindow}
            disabled={busy}
          />
        </>
      ) : null}
      <p className="muted">{es.schedule.hint}</p>

      <TextArea
        label={es.jobs.descriptionLabel}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />

      <FilePick
        label={es.jobs.photosLabel}
        hint={photos.length > 0 ? es.jobs.photosChosen(photos.length) : es.jobs.photosHint}
        buttonLabel={es.common.chooseMany}
        accept="image/*"
        multiple
        disabled={busy}
        files={photos}
        onFiles={(files) => setPhotos(files.slice(0, 6))}
      />

      <FilePick
        label={es.jobs.voiceLabel}
        buttonLabel={es.common.chooseAudio}
        accept="audio/*"
        disabled={busy}
        files={voice ? [voice] : []}
        onFiles={(files) => setVoice(files[0] ?? null)}
      />

      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.jobs.sending : es.jobs.send}
      </button>
    </form>
  );
}
