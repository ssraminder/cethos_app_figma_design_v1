-- Multi-file upload support: one job can contain multiple source files
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS source_files JSONB;

COMMENT ON COLUMN transcription_jobs.source_files IS
  'Array of {name, path, size, duration, format} for multi-file jobs. When set, file_name/file_path/file_size_bytes/file_duration_seconds reflect the first file or totals.';
