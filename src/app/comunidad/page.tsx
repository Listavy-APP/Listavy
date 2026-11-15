import { LEGAL_DOCS } from "@/lib/legal";
import { es } from "@/lib/i18n/es";
import { LegalDocumentView } from "@/components/LegalDocumentView";

export const metadata = { title: es.legal.communityTitle };

export default function CommunityPage() {
  return <LegalDocumentView doc={LEGAL_DOCS.community} title={es.legal.communityTitle} />;
}
