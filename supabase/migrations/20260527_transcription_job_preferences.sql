-- Phase 1 PR #3b: customer-pickable job preferences.
--
-- These columns drive the upload form (PR #3) and the delivery format
-- renderers (this PR). Defaults preserve existing job behavior — every
-- job today already gets speaker IDs + timestamps in the output, and the
-- "auto" layout resolves to table when either is on.

ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS include_timestamps BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_speaker_ids BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS verbatim_mode TEXT NOT NULL DEFAULT 'clean_smart',
  ADD COLUMN IF NOT EXISTS output_language_id UUID REFERENCES languages(id),
  ADD COLUMN IF NOT EXISTS delivery_layout TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE transcription_jobs
  DROP CONSTRAINT IF EXISTS transcription_jobs_verbatim_mode_check;
ALTER TABLE transcription_jobs
  ADD CONSTRAINT transcription_jobs_verbatim_mode_check
  CHECK (verbatim_mode IN ('verbatim','clean_smart','clean_heavy'));

ALTER TABLE transcription_jobs
  DROP CONSTRAINT IF EXISTS transcription_jobs_delivery_layout_check;
ALTER TABLE transcription_jobs
  ADD CONSTRAINT transcription_jobs_delivery_layout_check
  CHECK (delivery_layout IN ('paragraph','table','auto'));

COMMENT ON COLUMN transcription_jobs.include_timestamps IS
  'Customer pick: include [hh:mm:ss] timestamps in the delivered transcript. Default true. Forces delivery_layout to table when on.';
COMMENT ON COLUMN transcription_jobs.include_speaker_ids IS
  'Customer pick: include speaker labels (Speaker 1 / 2 / ...) in the delivered transcript. Default true. Forces delivery_layout to table when on.';
COMMENT ON COLUMN transcription_jobs.verbatim_mode IS
  'Customer pick: verbatim (preserve um/uh/false-starts) | clean_smart (strip fillers, default) | clean_heavy (also fix grammar). Consumed by transcription-ai-proofread.';
COMMENT ON COLUMN transcription_jobs.output_language_id IS
  'Customer pick: target language for the primary deliverable. NULL = same as source. If different, AI translation runs and produces an additional output in this language.';
COMMENT ON COLUMN transcription_jobs.delivery_layout IS
  'Customer pick: paragraph (continuous prose, merge same-speaker runs) | table (one row per segment with time + speaker + text) | auto (resolve to table when timestamps or speaker_ids are on, else paragraph).';
