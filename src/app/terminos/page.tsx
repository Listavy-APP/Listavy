import { LEGAL_DOCS } from "@/lib/legal";
import { es } from "@/lib/i18n/es";
import { LegalDocumentView } from "@/components/LegalDocumentView";

export const metadata = { title: es.legal.termsTitle };

export default function TermsPage() {
  return <LegalDocumentView doc={LEGAL_DOCS.terms} title={es.legal.termsTitle} />;
}
