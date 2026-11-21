import Link from "next/link";
import { connection } from "next/server";
import { BackArrow } from "@/components/BackBar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTradeCatalog } from "@/lib/data/trades-server";
import { getMunicipalities } from "@/lib/data/municipalities-server";
import { pageMetadata } from "@/lib/seo/metadata";
import { ServiceRequestForm } from "./ServiceRequestForm";

// Reads the session and query per request (same convention as notificaciones).
export const instant = false;

export const metadata = pageMetadata({
  title: "Pide este servicio",
  description: "Cuéntanos qué servicio necesitas y dónde. Te avisamos cuando haya un profesional.",
  path: "/pide-servicio",
});

type Params = { trade?: string; m?: string };

/** "Pide este servicio": a request for a trade in a municipality with no approved pro nearby. */
export default async function ServiceRequestPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Reads the session and query per request.
  await connection();
  const params = await searchParams;
  const [trades, municipalities] = await Promise.all([getTradeCatalog(), getMunicipalities()]);
  const initialTrade = trades.some((t) => t.key === params.trade) ? (params.trade ?? "") : "";
  const initialMunicipality = municipalities.some((m) => m.id === params.m) ? (params.m ?? "") : "";

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  let fullName = "";
  let phone = "";
  if (user) {
    const { data } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
    fullName = (data?.full_name as string | null) ?? "";
    phone = (data?.phone as string | null) ?? "";
  }

  const next = `/pide-servicio?trade=${encodeURIComponent(initialTrade)}&m=${encodeURIComponent(initialMunicipality)}`;
  return (
    <section className="stack">
      <Link className="back" href="/buscar" aria-label="Volver a buscar"><BackArrow /></Link>
      <h1>Pide este servicio</h1>
      <p className="muted">
        Si no hay un profesional aprobado para tu servicio en tu zona, déjanos tu pedido. Lo usamos para buscar
        profesionales y te avisamos cuando haya uno.
      </p>
      {user ? null : (
        <p className="muted">
          Para enviar el pedido, <Link href={`/login?next=${encodeURIComponent(next)}`}>inicia sesión</Link>. Tus datos
          quedan guardados en tu cuenta.
        </p>
      )}
      <ServiceRequestForm
        trades={trades.map((t) => ({ key: t.key, label: t.label }))}
        municipalities={municipalities}
        initialTrade={initialTrade}
        initialMunicipality={initialMunicipality}
        signedIn={user !== null}
        initialName={fullName}
        initialPhone={phone}
        loginNext={next}
      />
    </section>
  );
}
