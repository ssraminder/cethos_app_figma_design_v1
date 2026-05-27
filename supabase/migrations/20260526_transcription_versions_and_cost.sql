-- Transcription versions table for storing multiple transcript attempts
-- (original STT, reprocessed with different provider, AI-proofread)
CREATE TABLE IF NOT EXISTS transcription_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES transcription_jobs(id) ON DELETE CASCADE,
  version_type TEXT NOT NULL CHECK (version_type IN ('original', 'reprocess', 'proofread')),
  provider TEXT,
  model TEXT,
  transcript_text TEXT,
  transcript_json JSONB,
  word_count INTEGER,
  cost NUMERIC(10,6) DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcription_versions_job ON transcription_versions(job_id);

-- AI total cost accumulator on the jobs table
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS ai_total_cost NUMERIC(10,6) DEFAULT 0;

-- Grant access
GRANT SELECT, INSERT, UPDATE ON transcription_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON transcription_versions TO service_role;
