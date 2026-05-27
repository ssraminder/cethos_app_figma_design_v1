-- Multi-language transcription (code-switching) + custom AI cleanup instructions.
--
-- additional_language_ids: when set, the STT provider (currently Google STT v2
-- Chirp 2) gets the full list [primary, ...additional] for true bilingual /
-- code-switched transcription. Single-language jobs leave this NULL / empty.
--
-- custom_instructions: free-form text passed to Claude in the proofread step.
-- Example: "This file is a court interview. Speaker 1 is the judge; Speaker 2
-- is the defendant. Preserve all legal terminology verbatim." Helps the LLM
-- clean transcript output with project-specific context.

ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS additional_language_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT DEFAULT NULL;

COMMENT ON COLUMN transcription_jobs.additional_language_ids IS
  'Additional source languages for code-switched / bilingual audio. UUIDs reference languages(id). The primary source_language_id is always tried first; these are passed alongside to STT providers that support multi-language recognition (Google Chirp 2). NULL/empty = single-language transcription.';
COMMENT ON COLUMN transcription_jobs.custom_instructions IS
  'Free-form customer-supplied guidance for the Claude proofread step. Used in addition to (not instead of) automatic context like cross-file term consistency. Example: "Speaker 1 is the judge; preserve legal terms verbatim".';
