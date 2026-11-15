import type { LegalDocument } from "@/lib/legal/types";
import { es } from "@/lib/i18n/es";
import { BackBar } from "@/components/BackBar";

function formatDate(isoDate: string): string {
  // Date-only value: format at noon UTC so no time zone can move it to another day.
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One paragraph. A leading **bold** part renders bold; nothing else is parsed.
 */
function Paragraph({ text }: { text: string }) {
  const match = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(text);
  if (!match) return <p>{text}</p>;
  return (
    <p>
      <strong>{match[1]}</strong> {match[2]}
    </p>
  );
}

/** Renders a legal document. Shows the draft notice until counsel approves (status "final"). */
export function LegalDocumentView({ doc, title, backHref = "/" }: { doc: LegalDocument; title: string; backHref?: string }) {
  return (
    <section className="stack">
      <BackBar href={backHref} />
      <h1>{title}</h1>
      <p>{es.legal.operator}</p>
      {doc.status === "draft" ? <p className="notice">{es.legal.draftNotice}</p> : null}
      {doc.status === "final" && doc.updatedOn ? <p className="muted">{es.legal.updatedOn(formatDate(doc.updatedOn))}</p> : null}
      {doc.sections.map((section, i) => (
        <div key={i} className="stack">
          {section.title ? <h2>{section.title}</h2> : null}
          {section.paragraphs.map((text, j) => (
            <Paragraph key={j} text={text} />
          ))}
        </div>
      ))}
    </section>
  );
}
