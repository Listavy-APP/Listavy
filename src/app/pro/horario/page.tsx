import { redirect } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getMyPro } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { santoDomingoToday } from "@/lib/domain/schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScheduleForms, type HoursRow } from "./ScheduleForms";
import { UrgentToggle } from "./UrgentToggle";

export const metadata = { title: es.schedule.pro.title };
export const instant = false;

/** Pro's weekly hours and days off. Owner-only through RLS (migration 0090). */
export default async function HorarioPage() {
  // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/pro/horario");

  const pro = await getMyPro(supabase);
  if (!pro) {
    return (
      <section className="stack">
        <BackBar href="/cuenta" />
        <h1>{es.schedule.pro.title}</h1>
        <Link className="button" href="/pro/registro">{es.proStatus.applyCta}</Link>
      </section>
    );
  }

  const today = santoDomingoToday();
  const [{ data: hours }, { data: days }] = await Promise.all([
    supabase.from("pro_weekly_hours").select("weekday, enabled, start_time, end_time").eq("pro_id", pro.id),
    supabase.from("pro_days_off").select("day").eq("pro_id", pro.id).gte("day", today).order("day"),
  ]);

  const initialHours: HoursRow[] = ((hours ?? []) as { weekday: number; enabled: boolean; start_time: string | null; end_time: string | null }[])
    .map((h) => ({
      weekday: h.weekday,
      enabled: h.enabled,
      start: h.start_time?.slice(0, 5) ?? "08:00",
      end: h.end_time?.slice(0, 5) ?? "17:00",
    }));

  // Fee amount for the explainer. Null when the read fails; the explainer then uses the default.
  const { data: urgentFee } = await supabase.rpc("public_urgent_fee");
  return (
    <section className="stack">
      <BackBar href="/pro/estado" />
      <h1>{es.schedule.pro.title}</h1>
      {(pro as { available?: boolean }).available === false ? <p className="muted">{es.schedule.pro.offNote}</p> : null}
      <UrgentToggle
        initial={(pro as { urgent_available?: boolean }).urgent_available === true}
        feeDop={typeof urgentFee === "number" ? urgentFee : null}
      />
      <ScheduleForms
        proId={pro.id}
        today={today}
        initialHours={initialHours}
        initialDaysOff={((days ?? []) as { day: string }[]).map((d) => d.day)}
      />
    </section>
  );
}
