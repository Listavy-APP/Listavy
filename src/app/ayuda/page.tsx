import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.help.title };

type Faq = { readonly q: string; readonly a: string };

function FaqList({ items }: { items: readonly Faq[] }) {
  return (
    <>
      {items.map((item) => (
        <details key={item.q} className="contact-row">
          <summary>
            <span className="contact-label">{item.q}</span>
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </>
  );
}

export default function AyudaPage() {
  return (
    <section className="stack about">
      <BackBar href="/cuenta" />
      <div className="about-section">
        <h1>{es.help.title}</h1>
        <p className="lead">{es.help.intro}</p>
      </div>
      <div className="about-section">
        <h2>{es.help.clientTitle}</h2>
        <div className="hub-group">
          <FaqList items={es.help.faq} />
        </div>
      </div>
      <div className="about-section">
        <h2>{es.help.proTitle}</h2>
        <div className="hub-group">
          <FaqList items={es.help.proFaq} />
        </div>
      </div>
    </section>
  );
}
