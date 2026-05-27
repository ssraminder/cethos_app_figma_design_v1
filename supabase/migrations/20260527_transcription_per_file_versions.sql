-- Add file_index to transcription_versions for per-file operations
-- null = whole-job (combined), 0-based index = specific source file
ALTER TABLE transcription_versions ADD COLUMN IF NOT EXISTS file_index INTEGER;
