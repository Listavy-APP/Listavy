import { getTradeMap } from "@/lib/data/trades-server";
import { redirect } from "next/navigation";
import { RequestForm } from "./RequestForm";
import { FixedBookingForm } from "./FixedBookingForm";
import Link from "next/link";
import { listProFixedServices } from "@/lib/data/fixed";
import { FixedDiscovery } from "./FixedDiscovery";
import { ModeTabs } from "./ModeTabs";
import { listMunicipalities } from "@/lib/data/municipalities";
import { getMunicipalities } from "@/lib/data/municipalities-server";
import { getCurrentProfile } from "@/lib/data/profiles";
import { getProCard } from "@/lib/data/pros";
import { getClientStanding } from "@/lib/data/standing";
import { esTrust } from "@/lib/i18n/trust";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { listPriceGuides } from "@/lib/data/price-guides";
import { guideFor, type PriceGuide } from "@/lib/domain/price-guides";

export const metadata = { title: es.jobs.requestTitle };
export const instant = false;

/** Request page. Reached from a pro's profile with ?pro=<id>[,<id>...] (1-3 pros). */
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ pro?: string; modo?: string; servicio?: string; oficio?: string; mun?: string }>;
}) {
    // Per-request render: the session is read at request time.
  const tm = await getTradeMap();
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  // Urgent fee (0117). Null when the read fails: the urgent choice is then not offered, so no amount is guessed.
  const { data: urgentFee } = await supabase.rpc("public_urgent_fee");
  const { pro, modo, servicio, oficio, mun } = await searchParams;
  if (!userData.user) {
    // Keep the chosen pros across sign-in: send the user back to this exact request.
    const back = `/pedir${pro ? `?pro=${encodeURIComponent(pro)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  // Pros go back to their vendor hub (/cuenta); clients go back to discovery (/buscar).
  const profile = await getCurrentProfile(supabase);
  const backHref = profile?.role === "pro" ? "/cuenta" : "/buscar";
  const ids = (pro ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 3);

  const cards = (await Promise.all(ids.map((id) => getProCard(supabase, id)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  // Typical range for the chosen trade, when every chosen pro shares one trade. Never blocks the request.
  let guide: PriceGuide | null = null;
  if (cards.length > 0 && cards.every((c) => c.trade === cards[0].trade)) {
    try {
      guide = guideFor(await listPriceGuides(supabase), cards[0].trade);
    } catch {
      guide = null;
    }
  }

  const standing = await getClientStanding(supabase);
  if (standing.blocked) {
    return (
      <section className="stack">
        <BackBar href={backHref} />
        <h1>{es.jobs.requestTitle}</h1>
        <div className="panel stack">
          <b>{es.standing.blockedTitle}</b>
          <p>{es.standing.blockedBody}</p>
        </div>
      </section>
    );
  }

  // Suspended accounts cannot create requests (migration 0075). Say so before the form.
  const { data: suspended } = await supabase.rpc("is_client_suspended", { p_client: userData.user.id });
  if (suspended === true) {
    return (
      <section className="stack">
        <BackBar href={backHref} />
        <h1>{es.jobs.requestTitle}</h1>
        <div className="panel stack">
          <b>{esTrust.suspended.title}</b>
          <p>{esTrust.suspended.body}</p>
        </div>
      </section>
    );
  }

  // Service-first (0116 amendment): fixed mode with no pro chosen.
  if (modo === "fijo" && ids.length === 0) {
    return (
      <>
        <BackBar href={backHref} />
        <FixedDiscovery
          supabase={supabase}
          trades={tm}
          municipalities={await listMunicipalities(supabase)}
          oficio={oficio ?? null}
          servicio={servicio ?? null}
          mun={mun ?? null}
        />
      </>
    );
  }

  if (cards.length === 0) {
    return (
      <section className="stack">
        <BackBar href={backHref} />
        <ModeTabs active="quote" />
        <h1>{es.jobs.requestTitle}</h1>
        <p className="muted">{es.jobs.noPro}</p>
      </section>
    );
  }

  return (
    <>
      <BackBar href={backHref} />
      {standing.warning ? (
        <div className="panel stack">
          <b>{es.standing.warningTitle}</b>
          <p>{es.standing.warningBody(standing.low_count)}</p>
        </div>
      ) : null}
    {cards.length === 1 ? (
      <nav className="row" aria-label={es.fixed.modeQuote}>
        <Link className={modo === "fijo" ? "button secondary" : "button"} href={`/pedir?pro=${cards[0].id}`} aria-current={modo === "fijo" ? undefined : "page"}>
          {es.fixed.modeQuote}
        </Link>
        <Link className={modo === "fijo" ? "button" : "button secondary"} href={`/pedir?pro=${cards[0].id}&modo=fijo`} aria-current={modo === "fijo" ? "page" : undefined}>
          {es.fixed.modePrice}
        </Link>
      </nav>
    ) : null}
    {modo === "fijo" ? (
      cards.length !== 1 ? (
        <p className="muted">{es.fixed.chooseProFirst}</p>
      ) : (
        <FixedPath
          pro={cards[0]}
          preselectedId={servicio ?? null}
          municipalities={await getMunicipalities()}
        />
      )
    ) : (
      <RequestForm
        userId={userData.user.id}
        pros={cards.map((c) => ({ id: c.id, name: c.full_name, trade: c.trade, zone: c.zone, pro_type: c.pro_type }))}
        guide={guide}
        trades={tm}
        municipalities={await getMunicipalities()}
        urgentFeeDop={typeof urgentFee === "number" ? urgentFee : null}
      />
    )}
    </>
  );
}

/** Loads the pro's opted-in fixed services, then renders the fixed booking form. */
async function FixedPath({
  pro,
  preselectedId,
  municipalities,
}: {
  pro: { id: string; full_name: string | null; zone: string };
  preselectedId: string | null;
  municipalities: Awaited<ReturnType<typeof getMunicipalities>>;
}) {
  const supabase = await createSupabaseServerClient();
  const services = await listProFixedServices(supabase, pro.id);
  if (services.length === 0) {
    return <p className="muted">{es.fixed.noServices}</p>;
  }
  return (
    <FixedBookingForm
      pro={{ id: pro.id, name: pro.full_name, zone: pro.zone }}
      services={services}
      preselectedId={services.some((x) => x.id === preselectedId) ? preselectedId : null}
      municipalities={municipalities}
    />
  );
}
