import { COMMUNITY_RULES } from "./community";
import { CANCELLATION_POLICY } from "./cancellation";
import { COOKIES_POLICY } from "./cookies";
import { PRIVACY_POLICY } from "./privacy";
import { PRO_TERMS } from "./proTerms";
import { TERMS_OF_USE } from "./terms";
import type { LegalDocId, LegalDocument } from "./types";

export type { LegalDocId, LegalDocument, LegalSection } from "./types";

/** Every published document, by id. The id and version are what each acceptance records. */
export const LEGAL_DOCS: Record<LegalDocId, LegalDocument> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_USE,
  cookies: COOKIES_POLICY,
  cancellation: CANCELLATION_POLICY,
  community: COMMUNITY_RULES,
  pro_terms: PRO_TERMS,
};
