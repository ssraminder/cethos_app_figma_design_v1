-- Add transcript and summary columns to call_logs
ALTER TABLE comms.call_logs
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_at timestamptz;

COMMENT ON COLUMN comms.call_logs.transcript IS 'ElevenLabs speech-to-text transcription of the call recording';
COMMENT ON COLUMN comms.call_logs.summary IS 'Claude Haiku summary of the call transcript';
