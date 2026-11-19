"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice } from "@/components/ui/Choice";
import { updateJobSchedule } from "@/lib/data/jobs";
import { es } from "@/lib/i18n/es";
import {
  SCHEDULE_WINDOWS,
  maxScheduleDate,
  santoDomingoToday,
  scheduleProblem,
  type ScheduleWindow,
} from "@/lib/domain/schedule";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "asap" | "dated";

/** Homeowner edits the requested date and window. Shown only while the request is still 'requested'. */
export function ScheduleEditor({
  jobId,
  date,
  window,
}: {
  jobId: string;
  date: string | null;
  window: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(date ? "dated" : "asap");
  const [day, setDay] = useState(date ?? "");
  const [win, setWin] = useState<ScheduleWindow | "">((window as ScheduleWindow) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    const nextDate = mode === "dated" ? day : null;
    const nextWindow = mode === "dated" ? win || null : null;
    const problem = scheduleProblem(nextDate, nextWindow);
    if (problem) return setError(es.schedule.problems[problem]);
    setBusy(true);
    try {
      await updateJobSchedule(createSupabaseBrowserClient(), jobId, nextDate, nextWindow);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : es.schedule.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Choice
        legend={es.schedule.question}
        name="scheduleMode"
        value={mode}
        options={[
          { value: "asap", label: es.schedule.asap },
          { value: "dated", label: es.schedule.dated },
        ]}
        onChange={setMode}
        disabled={busy}
      />
      {mode === "dated" ? (
        <>
          <label className="field">
            <span>{es.schedule.dateLabel}</span>
            <input
              type="date"
              value={day}
              min={santoDomingoToday()}
              max={maxScheduleDate()}
              onChange={(e) => setDay(e.target.value)}
              disabled={busy}
            />
          </label>
          <Choice
            legend={es.schedule.windowLabel}
            name="scheduleWindow"
            value={win}
            options={SCHEDULE_WINDOWS.map((w) => ({ value: w, label: es.schedule.windows[w] }))}
            onChange={setWin}
            disabled={busy}
          />
        </>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {saved ? <p className="muted" role="status">{es.schedule.saved}</p> : null}
      <button className="button secondary" type="button" onClick={save} disabled={busy}>
        {es.schedule.save}
      </button>
    </div>
  );
}
