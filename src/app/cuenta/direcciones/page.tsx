import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { AddressManager, type SavedAddress } from "./AddressManager";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.addresses.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function AddressesPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/direcciones");

  const { data, error } = await supabase
    .from("addresses")
    .select("id, label, street, zone, reference, is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  const addresses: SavedAddress[] = error ? [] : ((data ?? []) as SavedAddress[]);

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1>{es.addresses.title}</h1>
      {error ? <p className="error">{es.addresses.saveFailed}</p> : null}
      <AddressManager userId={userData.user.id} addresses={addresses} />
    </section>
  );
}
