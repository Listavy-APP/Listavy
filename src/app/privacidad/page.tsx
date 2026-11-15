import { LEGAL_DOCS } from "@/lib/legal";
import { es } from "@/lib/i18n/es";
import { LegalDocumentView } from "@/components/LegalDocumentView";

export const metadata = { title: es.legal.privacyTitle };

export default function PrivacyPage() {
  return <LegalDocumentView doc={LEGAL_DOCS.privacy} title={es.legal.privacyTitle} />;
}
