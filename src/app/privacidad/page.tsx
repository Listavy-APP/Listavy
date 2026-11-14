import { PRIVACY_POLICY } from "@/lib/legal/privacy";
import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";

export const metadata = { title: es.legal.privacyTitle };

function formatDate(isoDate: string): string {
  // Date-only value: format at noon UTC so no time zone can move it to another day.
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function PrivacyPage() {
  const policy = PRIVACY_POLICY;
  return (
    <section className="stack">
      <BackBar href="/" />
      <h1>{es.legal.privacyTitle}</h1>
      <p>{es.legal.operator}</p>
      {policy.status === "draft" ? <p className="notice">{es.legal.privacyDraftNotice}</p> : null}
      {policy.status === "final" && policy.updatedOn ? (
        <p className="muted">{es.legal.updatedOn(formatDate(policy.updatedOn))}</p>
      ) : null}
      {policy.sections.map((section, i) => (
        <div key={i} className="stack">
          {section.title ? <h2>{section.title}</h2> : null}
          {section.paragraphs.map((text, j) => (
            <p key={j}>{text}</p>
          ))}
        </div>
      ))}
    </section>
  );
}
