import { ResubmitButton } from "./ResubmitButton";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPro } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoostPanel } from "./BoostPanel";
import { ProPlanPanel } from "./ProPlanPanel";
import { ManagePlanButton } from "./ManagePlanButton";
import { BioForm } from "./BioForm";
import { SpecialtiesForm } from "./SpecialtiesForm";
import { getTradeMap } from "@/lib/data/trades-server";
import { PricingZoneForm } from "./PricingZoneForm";
import { AvailabilityToggle } from "@/components/AvailabilityToggle";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { CloseProfile } from "./CloseProfile";
import { getPayoutDetails } from "@/lib/data/payouts";
import { esPayouts } from "@/lib/i18n/payouts";
import { getMyProChecklist } from "@/lib/data/proChecklist";
import { nudgeFor } from "@/lib/domain/proChecklist";
import { ProChecklist } from "./ProChecklist";
import { NudgeCard } from "./NudgeCard";

export const metadata = { title: es.proStatus.title };
export const instant = false;

export default async function ProStatusPage({ searchParams }: { searchParams: Promise<{ destacado?: string; plan?: string }> }) {
  const { destacado, plan: planParam } = await searchParams;
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/pro/estado");

  const pro = await getMyPro(supabase);
  const tm = await getTradeMap();

  // Current boost, if any. RLS limits this to the signed-in pro's own rows.
  const { data: activeBoost } = pro
    ? await supabase
        .from("boosts")
        .select("ends_at, status")
        .eq("pro_id", pro.id)
        .in("status", ["active", "paused"])
        .gt("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (!pro) {
    return (
      <section className="stack">
        <BackBar href="/cuenta" />
        <h1>{es.proStatus.title}</h1>
        <p className="lead">{es.proStatus.none}</p>
        <Link className="button" href="/pro/registro">
          {es.proStatus.applyCta}
        </Link>
      </section>
    );
  }

  if (pro.closed_at) {
    return (
      <section className="stack">
        <BackBar href="/cuenta" />
        <h1>{es.proClose.closedTitle}</h1>
        <p className="lead">{es.proClose.closedBody}</p>
        <Link className="button" href="/cuenta">
          {es.proClose.closedAction}
        </Link>
      </section>
    );
  }

  const hasPayoutDetails = (await getPayoutDetails(supabase, pro.id)) !== null;
  const checklist = await getMyProChecklist(supabase);
  const nudge = nudgeFor(checklist);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{es.proStatus.title}</h1>
      {nudge ? <NudgeCard item={nudge.item} /> : null}
      <ProChecklist rows={checklist} />
      {!hasPayoutDetails ? (
        <section className="panel stack">
          <b>{esPayouts.bannerTitle}</b>
          <p className="muted">{esPayouts.bannerBody}</p>
          <Link className="button secondary" href="/pro/pagos">
            {esPayouts.bannerCta}
          </Link>
        </section>
      ) : null}
      <p className="lead">
        {pro.verification_status === "approved" && (pro as { available?: boolean }).available === false
          ? es.proStatus.approvedHidden
          : es.proStatus[pro.verification_status]}
      </p>
      {pro.verification_status === "rejected" && (
        <section className="panel stack">
          <b>{es.proStatus.rejectedReason}</b>
          <p>{pro.rejection_reason ?? ""}</p>
          <ResubmitButton proId={pro.id} />
        </section>
      )}
      {pro.pro_free_until && new Date(pro.pro_free_until) > new Date() ? (
        <p className="notice">
          {es.referral.freeProUntil(new Date(pro.pro_free_until).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" }))}
        </p>
      ) : null}
      {pro.verification_status === "pending" && (
        <section className="panel stack">
          <h2>{es.proStatus.expectations.waitTitle}</h2>
          <ul>
            {es.proStatus.expectations.waitItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h2>{es.proStatus.expectations.promiseTitle}</h2>
          <ul>
            {es.proStatus.expectations.promiseItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {pro.verification_status === "approved" && (
        <Link className="button" href={`/pro/${pro.id}`}>
          {es.search.viewProfile}
        </Link>
      )}
      {pro.verification_status === "approved" && activeBoost && (
        <p className="panel">
          {activeBoost.status === "paused"
            ? es.proStatus.boost.paused
            : es.proStatus.boost.active(
            new Date(activeBoost.ends_at).toLocaleDateString("es-DO", {
              dateStyle: "long",
              timeZone: "America/Santo_Domingo",
            }),
          )}
        </p>
      )}
      {pro.verification_status === "approved" && (
        <Link className="button secondary" href="/pro/pagos">
          {es.proPayouts.title}
        </Link>
      )}
      {pro.verification_status === "approved" && (
        <AvailabilityToggle proId={pro.id} initial={(pro as { available?: boolean }).available ?? true} />
      )}
      <PricingZoneForm initialMin={pro.price_min_dop} initialMax={pro.price_max_dop} initialZone={pro.zone} />
      {pro.verification_status === "approved" && tm[pro.trade]?.specialties.length ? (
        <SpecialtiesForm
          initial={(pro as { specialties?: string[] }).specialties ?? []}
          options={tm[pro.trade]!.specialties}
        />
      ) : null}
      {pro.verification_status === "approved" && <BioForm proId={pro.id} initial={(pro as { bio?: string | null }).bio ?? null} />}
      {pro.verification_status === "approved" && (() => {
        const planEnd = pro.plan_current_period_end ?? null;
        const isPro = pro.plan === "pro";
        return (
          <section className="panel stack" aria-labelledby="plan-status-title">
            <h2 id="plan-status-title">{isPro ? es.proStatus.plan.activeTitle : es.proStatus.plan.title}</h2>
            <p>{isPro ? es.proStatus.plan.rateActive : es.proStatus.plan.rateFree}</p>
            {isPro && planEnd ? (
              <p className="muted">
                {es.proStatus.plan.nextCharge(new Date(planEnd).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santo_Domingo" }))}
              </p>
            ) : null}
            {planParam === "ok" && !isPro ? <p role="status">{es.proStatus.plan.confirming}</p> : null}
            {planParam === "cancelado" && !isPro ? <p className="muted" role="status">{es.proStatus.plan.cancelled}</p> : null}
            {isPro ? <ManagePlanButton /> : null}
          </section>
        );
      })()}
      {pro.verification_status === "approved" && pro.plan !== "pro" && planParam !== "ok" && <ProPlanPanel />}
      {destacado === "ok" && !activeBoost ? (
        <p className="panel" role="status">{es.proStatus.boost.confirming}</p>
      ) : null}
      {destacado === "cancelado" ? <p className="muted" role="status">{es.proStatus.boost.cancelled}</p> : null}
      {/* Back from checkout the boost activates a moment later; hide the buy panel until then. */}
      {pro.verification_status === "approved" && !activeBoost && destacado !== "ok" && <BoostPanel />}
      <CloseProfile />
    </section>
  );
}
