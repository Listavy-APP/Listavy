import { LEGAL_DOCS } from "@/lib/legal";
import { es } from "@/lib/i18n/es";
import { LegalDocumentView } from "@/components/LegalDocumentView";

export const metadata = { title: es.legal.proTermsTitle };

export default function ProTermsPage() {
  return <LegalDocumentView doc={LEGAL_DOCS.pro_terms} title={es.legal.proTermsTitle} backHref="/pro/registro" />;
}
