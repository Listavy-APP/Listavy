import { redirect } from "next/navigation";
import { RequestForm } from "./RequestForm";
import { getProCard } from "@/lib/data/pros";
import { getClientStanding } from "@/lib/data/standing";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.jobs.requestTitle };
export const instant = false;

/** Request page. Reached from a pro's profile with ?pro=<id>[,<id>...] (1-3 pros). */
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ pro?: string }>;
}) {
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const { pro } = await searchParams;
  if (!userData.user) {
    // Keep the chosen pros across sign-in: send the user back to this exact request.
    const back = `/pedir${pro ? `?pro=${encodeURIComponent(pro)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  const ids = (pro ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 3);

  const cards = (await Promise.all(ids.map((id) => getProCard(supabase, id)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  const standing = await getClientStanding(supabase);
  if (standing.blocked) {
    return (
      <section className="stack">
        <BackBar href="/buscar" />
        <h1>{es.jobs.requestTitle}</h1>
        <div className="panel stack">
          <b>{es.standing.blockedTitle}</b>
          <p>{es.standing.blockedBody}</p>
        </div>
      </section>
    );
  }

  if (cards.length === 0) {
    return (
      <section className="stack">
        <BackBar href="/buscar" />
        <h1>{es.jobs.requestTitle}</h1>
        <p className="muted">{es.jobs.noPro}</p>
      </section>
    );
  }

  return (
    <>
      {standing.warning ? (
        <div className="panel stack">
          <b>{es.standing.warningTitle}</b>
          <p>{es.standing.warningBody(standing.low_count)}</p>
        </div>
      ) : null}
    <RequestForm
      userId={userData.user.id}
      pros={cards.map((c) => ({ id: c.id, name: c.full_name, trade: c.trade, zone: c.zone }))}
    />
    </>
  );
}
