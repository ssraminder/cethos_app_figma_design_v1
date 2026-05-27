-- Stable segment IDs as the editing key.
--
-- Adds transcript_format_version to transcription_jobs and transcription_versions.
-- v1 = legacy free-form transcript_json (word stream OR utterances OR segments).
-- v2 = canonical { format_version:2, segments:[{id, speaker_id, start, end, text, translations?, words?}], meta?, words? }
--
-- Existing rows are marked v1 and stay readable via legacy code paths until the
-- backfill function rewrites them to v2.
--
-- Also extends version_type CHECK to allow 'human_review' (xlsx import) and
-- 'inline_edit' (per-segment UI edit) version rows.
ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS transcript_format_version SMALLINT NOT NULL DEFAULT 2;

ALTER TABLE transcription_versions
  ADD COLUMN IF NOT EXISTS transcript_format_version SMALLINT NOT NULL DEFAULT 2;

-- Mark every pre-existing row as v1 so new defaults don't lie about old data.
UPDATE transcription_jobs
  SET transcript_format_version = 1
  WHERE created_at < NOW() AND transcript_format_version = 2;

UPDATE transcription_versions
  SET transcript_format_version = 1
  WHERE created_at < NOW() AND transcript_format_version = 2;

-- GIN index on segments for future per-id lookups (e.g. selective updates).
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_segments
  ON transcription_jobs USING GIN ((transcript_json -> 'segments'));

CREATE INDEX IF NOT EXISTS idx_transcription_versions_segments
  ON transcription_versions USING GIN ((transcript_json -> 'segments'));

-- Extend version_type to allow new version row kinds.
ALTER TABLE transcription_versions
  DROP CONSTRAINT IF EXISTS transcription_versions_version_type_check;

ALTER TABLE transcription_versions
  ADD CONSTRAINT transcription_versions_version_type_check
  CHECK (version_type IN ('original', 'reprocess', 'proofread', 'translate', 'human_review', 'inline_edit'));
