-- Google STT v2 batchRecognize is async (returns a Long Running Operation that
-- can take 5-15 minutes for a 2hr file). We can't block the edge function for
-- that long, so we kick off the operation, store its name, and have a cron
-- function poll until done.

ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS provider_async_operation_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_async_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_async_gcs_uri TEXT;

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_async_pending
  ON transcription_jobs (provider_async_operation_name)
  WHERE provider_async_operation_name IS NOT NULL;

COMMENT ON COLUMN transcription_jobs.provider_async_operation_name IS
  'Google STT v2 Long Running Operation name (e.g. projects/.../operations/abc123). Set when batchRecognize is kicked off; cleared by transcription-poll-google-batch when the op completes or fails.';
COMMENT ON COLUMN transcription_jobs.provider_async_started_at IS
  'When the async operation was kicked off. Used by the poll function to time out stuck operations (>1h = assume dead, mark failed).';
COMMENT ON COLUMN transcription_jobs.provider_async_gcs_uri IS
  'gs:// URI of the audio file uploaded to GCS for batchRecognize input. Cleaned up by the poll function once the operation completes.';
