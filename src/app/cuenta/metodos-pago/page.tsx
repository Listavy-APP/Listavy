import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BackBar } from "@/components/BackBar";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PaymentMethodsManager } from "./PaymentMethodsManager";

export const metadata = { title: es.paymentMethods.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function PaymentMethodsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/cuenta/metodos-pago");

  return (
    <section className="stack">
      <BackBar href="/cuenta" />
      <h1 className="page-title">{es.paymentMethods.title}</h1>
      <p className="muted">{es.paymentMethods.intro}</p>
      <PaymentMethodsManager />
    </section>
  );
}
