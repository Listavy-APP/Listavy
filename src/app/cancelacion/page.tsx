import { LEGAL_DOCS } from "@/lib/legal";
import { es } from "@/lib/i18n/es";
import { LegalDocumentView } from "@/components/LegalDocumentView";

export const metadata = { title: es.legal.cancellationTitle };

export default function CancellationPage() {
  return <LegalDocumentView doc={LEGAL_DOCS.cancellation} title={es.legal.cancellationTitle} />;
}
