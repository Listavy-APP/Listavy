import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.legal.termsTitle };

export default function TermsPage() {
  return (
    <section className="stack">
      <BackBar href="/" />
      <h1>{es.legal.termsTitle}</h1>
      <p className="notice">{es.legal.termsPreparing}</p>
    </section>
  );
}
