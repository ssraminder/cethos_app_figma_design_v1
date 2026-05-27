-- Add transcript_json to transcription_versions so proofread versions
-- preserve speaker structure, timestamps, and speaker IDs.
ALTER TABLE transcription_versions ADD COLUMN IF NOT EXISTS transcript_json JSONB;
