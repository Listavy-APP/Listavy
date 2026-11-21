import { getTradeMap } from "@/lib/data/trades-server";
import { redirect } from "next/navigation";
import { RequestForm } from "./RequestForm";
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
  searchParams: Promise<{ pro?: string }>;
}) {
    // Per-request render: the session is read at request time.
  const tm = await getTradeMap();
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const { pro } = await searchParams;
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

  if (cards.length === 0) {
    return (
      <section className="stack">
        <BackBar href={backHref} />
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
    <RequestForm
      userId={userData.user.id}
      pros={cards.map((c) => ({ id: c.id, name: c.full_name, trade: c.trade, zone: c.zone, pro_type: c.pro_type }))}
      guide={guide}
      trades={tm}
      municipalities={await getMunicipalities()}
    />
    </>
  );
}
