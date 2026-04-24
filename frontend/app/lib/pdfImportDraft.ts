// Survives Next.js remount when `router.replace` changes `[id]` (import page).

import type { ExtractedPosition, ExtractionResult } from './api';

const PENDING = 'openportfolio.pdfImport.restorePending';
const DRAFT = 'openportfolio.pdfImport.draft';

export type PdfImportDraftMeta = Pick<
  ExtractionResult,
  | 'statement_account_name'
  | 'statement_account_name_confidence'
  | 'matched_account_id'
  | 'matched_account_confidence'
  | 'extraction_warnings'
  | 'extracted_at'
  | 'model'
>;

export type PdfImportDraft = {
  rows: ExtractedPosition[];
  selectedIndices: number[];
  filename: string;
  meta: PdfImportDraftMeta;
};

/** Maps API extraction result into draft metadata (shared by account import and positions entry). */
export function pdfImportMetaFromExtractionResult(result: ExtractionResult): PdfImportDraftMeta {
  return {
    statement_account_name: result.statement_account_name,
    statement_account_name_confidence: result.statement_account_name_confidence,
    matched_account_id: result.matched_account_id,
    matched_account_confidence: result.matched_account_confidence,
    extraction_warnings: result.extraction_warnings,
    extracted_at: result.extracted_at,
    model: result.model,
  };
}

export function stashPdfImportDraftForRouteChange(draft: PdfImportDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(DRAFT, JSON.stringify(draft));
  sessionStorage.setItem(PENDING, '1');
}

export function consumePdfImportDraftIfPending(): PdfImportDraft | null {
  if (typeof window === 'undefined') return null;
  if (sessionStorage.getItem(PENDING) !== '1') return null;
  sessionStorage.removeItem(PENDING);
  const raw = sessionStorage.getItem(DRAFT);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PdfImportDraft;
  } catch {
    return null;
  }
}

export function clearPdfImportDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PENDING);
  sessionStorage.removeItem(DRAFT);
}
