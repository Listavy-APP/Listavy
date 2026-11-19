"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "@/components/Switch";
import { es } from "@/lib/i18n/es";
import { addDays } from "@/lib/domain/schedule";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type HoursRow = { weekday: number; enabled: boolean; start: string; end: string };

const DAYS_OFF_WINDOW = 365;

/** Weekly hours (one range per day, no split shifts) and days off. Informational; nothing is blocked. */
export function ScheduleForms({
  proId,
  today,
  initialHours,
  initialDaysOff,
}: {
  proId: string;
  today: string;
  initialHours: HoursRow[];
  initialDaysOff: string[];
}) {
  const t = es.schedule.pro;
  const router = useRouter();
  const [rows, setRows] = useState<HoursRow[]>(() =>
    [0, 1, 2, 3, 4, 5, 6].map(
      (w) => initialHours.find((h) => h.weekday === w) ?? { weekday: w, enabled: false, start: "08:00", end: "17:00" },
    ),
  );
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyMsg, setWeeklyMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [daysOff, setDaysOff] = useState<string[]>(initialDaysOff);
  const [newDay, setNewDay] = useState("");
  const [dayBusy, setDayBusy] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);

  function patch(weekday: number, change: Partial<HoursRow>) {
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...change } : r)));
  }

  async function saveWeekly() {
    setWeeklyMsg(null);
    const bad = rows.some((r) => r.enabled && r.end <= r.start);
    if (bad) return setWeeklyMsg({ kind: "error", text: t.rangeInvalid });
    setWeeklyBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pro_weekly_hours").upsert(
        rows.map((r) => ({
          pro_id: proId,
          weekday: r.weekday,
          enabled: r.enabled,
          start_time: r.enabled ? r.start : null,
          end_time: r.enabled ? r.end : null,
        })),
        { onConflict: "pro_id,weekday" },
      );
      if (error) throw error;
      setWeeklyMsg({ kind: "ok", text: t.weeklySaved });
      router.refresh();
    } catch {
      setWeeklyMsg({ kind: "error", text: t.error });
    } finally {
      setWeeklyBusy(false);
    }
  }

  async function addDayOff() {
    setDayError(null);
    if (!newDay || newDay < today || newDay > addDays(today, DAYS_OFF_WINDOW)) return setDayError(t.dayInvalid);
    setDayBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pro_days_off").insert({ pro_id: proId, day: newDay });
      // A duplicate day is already marked, so it is not an error.
      if (error && error.code !== "23505") throw error;
      setDaysOff((prev) => (prev.includes(newDay) ? prev : [...prev, newDay].sort()));
      setNewDay("");
    } catch {
      setDayError(t.error);
    } finally {
      setDayBusy(false);
    }
  }

  async function removeDayOff(day: string) {
    setDayError(null);
    setDayBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pro_days_off").delete().eq("pro_id", proId).eq("day", day);
      if (error) throw error;
      setDaysOff((prev) => prev.filter((d) => d !== day));
    } catch {
      setDayError(t.error);
    } finally {
      setDayBusy(false);
    }
  }

  return (
    <div className="stack">
      <h2>{t.weeklyTitle}</h2>
      <p className="muted">{t.weeklyHint}</p>
      {rows.map((r) => (
        <div key={r.weekday} className="panel stack">
          <Switch
            checked={r.enabled}
            onChange={(next) => patch(r.weekday, { enabled: next })}
            label={`${t.days[r.weekday]}: ${r.enabled ? "" : t.off}`}
            disabled={weeklyBusy}
          />
          {r.enabled ? (
            <div className="stack">
              <label className="field">
                <span>{t.from}</span>
                <input type="time" value={r.start} onChange={(e) => patch(r.weekday, { start: e.target.value })} disabled={weeklyBusy} />
              </label>
              <label className="field">
                <span>{t.to}</span>
                <input type="time" value={r.end} onChange={(e) => patch(r.weekday, { end: e.target.value })} disabled={weeklyBusy} />
              </label>
            </div>
          ) : null}
        </div>
      ))}
      {weeklyMsg ? (
        <p className={weeklyMsg.kind === "error" ? "error" : "muted"} role={weeklyMsg.kind === "error" ? "alert" : "status"}>
          {weeklyMsg.text}
        </p>
      ) : null}
      <button className="button" type="button" onClick={saveWeekly} disabled={weeklyBusy}>
        {t.saveWeekly}
      </button>

      <h2>{t.daysOffTitle}</h2>
      <p className="muted">{t.daysOffHint}</p>
      {daysOff.length === 0 ? <p className="muted">{t.noDaysOff}</p> : null}
      <ul className="list">
        {daysOff.map((d) => (
          <li key={d} className="settings-row">
            <span>{d}</span>
            <button className="button secondary" type="button" onClick={() => removeDayOff(d)} disabled={dayBusy}>
              {t.removeDay}
            </button>
          </li>
        ))}
      </ul>
      <label className="field">
        <span>{es.schedule.dateLabel}</span>
        <input type="date" value={newDay} min={today} max={addDays(today, DAYS_OFF_WINDOW)} onChange={(e) => setNewDay(e.target.value)} disabled={dayBusy} />
      </label>
      {dayError ? <p className="error" role="alert">{dayError}</p> : null}
      <button className="button secondary" type="button" onClick={addDayOff} disabled={dayBusy || !newDay}>
        {t.addDay}
      </button>
    </div>
  );
}
