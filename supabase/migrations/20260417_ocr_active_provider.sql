-- Active OCR provider per file (which provider's results are authoritative
-- for downstream AI analysis + pricing). Separate from ocr_provider which
-- tracks the last-run provider for audit purposes.

ALTER TABLE ocr_batch_files
  ADD COLUMN IF NOT EXISTS active_ocr_provider varchar(50) NOT NULL DEFAULT 'google_document_ai';

-- Backfill: files where the only result rows are from Mistral (auto-fallback
-- cases from before this migration) should have active_ocr_provider='mistral'
-- so analyse-ocr-next picks up the right rows.
UPDATE ocr_batch_files f
   SET active_ocr_provider = 'mistral'
 WHERE f.ocr_provider = 'mistral'
   AND NOT EXISTS (
     SELECT 1 FROM ocr_batch_results r
      WHERE r.file_id = f.id AND r.ocr_provider = 'google_document_ai'
   );

CREATE INDEX IF NOT EXISTS idx_ocr_batch_files_active_provider
  ON ocr_batch_files (active_ocr_provider);
