/**
 * Shared shape for every published legal document. Each document lives in its own file
 * under src/lib/legal and is rendered by src/components/LegalDocumentView.tsx.
 */

export type LegalDocId = "privacy" | "terms" | "cookies" | "cancellation" | "community" | "pro_terms";

export interface LegalSection {
  /** Section heading. Null for an untitled opening section. */
  title: string | null;
  paragraphs: readonly string[];
}

export interface LegalDocument {
  id: LegalDocId;
  /** "draft" shows the review notice. Only counsel approval moves a document to "final". */
  status: "draft" | "final";
  /** Version recorded with each acceptance. Change it when the text changes in a material way. */
  version: string;
  /** Approval date, YYYY-MM-DD. Null while the text is a draft. */
  updatedOn: string | null;
  sections: readonly LegalSection[];
}
