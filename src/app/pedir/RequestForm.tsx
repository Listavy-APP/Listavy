"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LocationConsent } from "@/components/LocationConsent";
import { Choice } from "@/components/ui/Choice";
import { FilePick } from "@/components/ui/FilePick";
import { TextArea } from "@/components/ui/TextArea";
import { createJobRequest, setLocationConsent, uploadJobFile, type JobType } from "@/lib/data/jobs";
import { es } from "@/lib/i18n/es";
import { resizeImage } from "@/lib/media/resize";
import { SD_ZONES } from "@/lib/domain/catalog";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ProOption = { id: string; name: string | null; trade: string; zone: string };

export function RequestForm(props: { userId: string; pros: ProOption[] }) {
  const router = useRouter();
  const trade = props.pros[0].trade;
  const sameTrade = props.pros.every((p) => p.trade === trade);

  const [zone, setZone] = useState<string>(props.pros[0].zone || SD_ZONES[0]);
  const [jobType, setJobType] = useState<JobType>("repair");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!sameTrade) return setError(es.jobs.sameTradeHint);
    if (description.trim().length < 20) return setError(es.jobs.descriptionShort);
    if (photos.length < 1) return setError(es.jobs.photoRequired);

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const photoPaths: string[] = [];
      for (const file of photos) {
        const blob = await resizeImage(file);
        photoPaths.push(await uploadJobFile(supabase, props.userId, blob, "jpg"));
      }
      let voicePath: string | null = null;
      if (voice) {
        const ext = voice.name.split(".").pop() || "m4a";
        voicePath = await uploadJobFile(supabase, props.userId, voice, ext);
      }
      const jobId = await createJobRequest(supabase, {
        trade,
        zone,
        description: description.trim(),
        jobType,
        proIds: props.pros.map((p) => p.id),
        photoPaths,
        voicePath,
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
        {error ? <p className="error">{error}</p> : null}
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
      <ul className="list">
        {props.pros.map((p) => (
          <li key={p.id}>
            <strong>{p.name ?? "—"}</strong> · {es.trades[p.trade as keyof typeof es.trades] ?? p.trade}
          </li>
        ))}
      </ul>
      <p className="muted">{es.jobs.threeQuotesHint}</p>

      <label className="field">
        <span>{es.jobs.zoneLabel}</span>
        <select value={zone} onChange={(e) => setZone(e.target.value)}>
          {SD_ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
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
