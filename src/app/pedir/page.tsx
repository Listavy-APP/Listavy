import Link from "next/link";
import { redirect } from "next/navigation";
import { RequestForm } from "./RequestForm";
import { getProCard } from "@/lib/data/pros";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.jobs.requestTitle };
export const instant = false;

/** Request page. Reached from a pro's profile with ?pro=<id>[,<id>...] (1-3 pros). */
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ pro?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { pro } = await searchParams;
  const ids = (pro ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 3);

  const cards = (await Promise.all(ids.map((id) => getProCard(supabase, id)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  if (cards.length === 0) {
    return (
      <section className="stack">
        <h1>{es.jobs.requestTitle}</h1>
        <p className="muted">{es.jobs.noPro}</p>
        <Link className="button secondary" href="/buscar">
          {es.common.back}
        </Link>
      </section>
    );
  }

  return (
    <RequestForm
      userId={userData.user.id}
      pros={cards.map((c) => ({ id: c.id, name: c.full_name, trade: c.trade, zone: c.zone }))}
    />
  );
}
