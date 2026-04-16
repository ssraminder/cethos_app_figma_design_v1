-- ============================================================================
-- Migration: Mistral OCR Backup + Layout-Aware Output
-- Date: 2026-04-16
-- Description:
--   1. Add ocr_provider + markdown_text to ocr_batch_results (per-page provider
--      tracking and layout-preserved output from Mistral)
--   2. Add ocr_provider, fallback_attempted, primary_provider_error to
--      ocr_batch_files (file-level provider tracking + fallback audit trail)
--   3. Index on ocr_batch_files.ocr_provider for analytics queries
--
-- Additive only — raw_text remains canonical. markdown_text is nullable and
-- populated only by Mistral. Existing Google Document AI rows default to
-- ocr_provider='google_document_ai'.
-- ============================================================================

-- ocr_batch_results: per-page provider + layout output
ALTER TABLE ocr_batch_results
  ADD COLUMN IF NOT EXISTS ocr_provider   varchar(50) NOT NULL DEFAULT 'google_document_ai',
  ADD COLUMN IF NOT EXISTS markdown_text  text;

-- ocr_batch_files: file-level provider + fallback audit
ALTER TABLE ocr_batch_files
  ADD COLUMN IF NOT EXISTS ocr_provider             varchar(50) NOT NULL DEFAULT 'google_document_ai',
  ADD COLUMN IF NOT EXISTS fallback_attempted       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_provider_error   text;

CREATE INDEX IF NOT EXISTS idx_ocr_batch_files_provider
  ON ocr_batch_files (ocr_provider);
