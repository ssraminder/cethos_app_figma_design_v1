-- Fix: ai_analysis_results.quote_file_id UNIQUE constraint blocks re-analysis.
--
-- update-quote-from-analysis soft-deletes existing rows (sets deleted_at) then
-- inserts fresh ones for the same quote_file_id. The plain UNIQUE constraint
-- treats soft-deleted rows as live, so the insert fails with 23505 and the
-- function returns 400. Symptom: "Update Quote" from OcrResultsModal fails on
-- any quote that already has analysis rows.
--
-- Fix: replace with a partial unique index that only enforces uniqueness among
-- live (deleted_at IS NULL) rows. Preserves the "one active analysis per file"
-- invariant while allowing soft-delete history to coexist.

ALTER TABLE public.ai_analysis_results
  DROP CONSTRAINT IF EXISTS ai_analysis_results_quote_file_id_unique;

DROP INDEX IF EXISTS public.ai_analysis_results_quote_file_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS ai_analysis_results_quote_file_id_active_unique
  ON public.ai_analysis_results (quote_file_id)
  WHERE deleted_at IS NULL AND quote_file_id IS NOT NULL;
