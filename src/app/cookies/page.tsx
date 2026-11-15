import { LEGAL_DOCS } from "@/lib/legal";
import { es } from "@/lib/i18n/es";
import { LegalDocumentView } from "@/components/LegalDocumentView";

export const metadata = { title: es.legal.cookiesTitle };

export default function CookiesPage() {
  return <LegalDocumentView doc={LEGAL_DOCS.cookies} title={es.legal.cookiesTitle} />;
}
