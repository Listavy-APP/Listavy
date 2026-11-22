import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { getMunicipalities } from "@/lib/data/municipalities-server";
import { listMyProperties } from "@/lib/data/properties";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PropertyManager } from "./PropertyManager";

export const metadata = { title: es.properties.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function PropertiesPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/propiedades");

  const [properties, municipalities] = await Promise.all([listMyProperties(supabase), getMunicipalities()]);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.properties.title}</h1>
      <Link className="button secondary" href="/cuenta/propiedades/resumen">
        {es.properties.statement}
      </Link>
      <PropertyManager userId={userData.user.id} properties={properties} municipalities={municipalities} />
    </section>
  );
}
