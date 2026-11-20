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
import { resizeImage } from "@/lib/media/resize";
import { cityOfZone } from "@/lib/domain/catalog";
import { formatRange, type PriceGuide } from "@/lib/domain/price-guides";
import { CityZoneSelect } from "@/components/CityZoneSelect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SCHEDULE_WINDOWS, maxScheduleDate, santoDomingoToday, scheduleProblem, type ScheduleWindow } from "@/lib/domain/schedule";

type ProOption = { id: string; name: string | null; trade: string; zone: string; pro_type: "individual" | "company" };

export function RequestForm(props: { userId: string; pros: ProOption[]; guide?: PriceGuide | null }) {
  const router = useRouter();
  const trade = props.pros[0].trade;
  const sameTrade = props.pros.every((p) => p.trade === trade);

  const [zone, setZone] = useState<string>(props.pros[0].zone);
  const [jobType, setJobType] = useState<JobType>("repair");
  // Person / company choice (Phase 1). The server refuses a pro of the other type.
  const [requestedType, setRequestedType] = useState<RequestedType>("any");
  // Pros whose type does not match the choice. The server refuses them too; this stops the request early.
  const mismatched = requestedType === "any" ? [] : props.pros.filter((p) => p.pro_type !== requestedType);
  // Scheduling. "Lo antes posible" is preselected, so the choice adds no extra step by default.
  const [scheduleMode, setScheduleMode] = useState<"asap" | "dated">("asap");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleWindow, setScheduleWindow] = useState<ScheduleWindow | "">("");
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
    if (description.trim().length < 20) return setError(es.jobs.descriptionShort);
    if (photos.length < 1) return setError(es.jobs.photoRequired);
    // Every chosen pro must serve the city of the job. The zone list follows the city.
    const jobCity = cityOfZone(zone);
    if (props.pros.some((p) => cityOfZone(p.zone) !== jobCity)) return setError(es.cityUi.mismatch);

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
        zone,
        description: description.trim(),
        jobType,
        proIds: props.pros.map((p) => p.id),
        photoPaths,
        voicePath,
        requestedProType: requestedType,
        scheduledDate: schedDate,
        scheduledWindow: schedWindow,
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
            <strong>{p.name ?? "—"}</strong> · {es.trades[p.trade as keyof typeof es.trades] ?? p.trade}
          </li>
        ))}
      </ul>
      <p className="muted">{props.pros.length === 1 ? es.jobs.oneQuoteHint : es.jobs.manyQuotesHint(props.pros.length)}</p>

      <CityZoneSelect
        cityName="city"
        zoneName="zone"
        zoneLabel={es.jobs.zoneLabel}
        defaultZone={zone}
        onChange={(_, z) => setZone(z)}
      />

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
              max={maxScheduleDate()}
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
