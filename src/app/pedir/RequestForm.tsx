"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createJobRequest, uploadJobFile, type JobType } from "@/lib/data/jobs";
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
      router.push(`/trabajos/${jobId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.jobs.genericError);
      setBusy(false);
    }
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

      <fieldset className="field">
        <legend>{es.jobs.typeLabel}</legend>
        <label>
          <input type="radio" name="jobType" checked={jobType === "repair"} onChange={() => setJobType("repair")} />{" "}
          {es.jobs.typeRepair}
        </label>
        <label>
          <input
            type="radio"
            name="jobType"
            checked={jobType === "diagnostic"}
            onChange={() => setJobType("diagnostic")}
          />{" "}
          {es.jobs.typeDiagnostic}
        </label>
        <p className="muted">{jobType === "diagnostic" ? es.jobs.diagnosticHint : es.jobs.repairHint}</p>
      </fieldset>

      <label className="field">
        <span>{es.jobs.descriptionLabel}</span>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>

      <label className="field">
        <span>{es.jobs.photosLabel}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 6))}
        />
        <span className="muted">{photos.length > 0 ? es.jobs.photosChosen(photos.length) : es.jobs.photosHint}</span>
      </label>

      <label className="field">
        <span>{es.jobs.voiceLabel}</span>
        <input type="file" accept="audio/*" onChange={(e) => setVoice(e.target.files?.[0] ?? null)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? es.jobs.sending : es.jobs.send}
      </button>
    </form>
  );
}
