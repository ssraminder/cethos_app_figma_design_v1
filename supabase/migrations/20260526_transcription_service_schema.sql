-- =============================================================================
-- Transcription Service — Phase 1 Schema
-- =============================================================================

CREATE TABLE transcription_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_duration_seconds NUMERIC NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','expired')),
  provider TEXT CHECK (provider IN ('assemblyai','openai','elevenlabs')),
  provider_job_id TEXT,
  provider_cost NUMERIC(10,6),
  source_language_id UUID REFERENCES languages(id),
  detected_language TEXT,
  language_confidence NUMERIC(5,4),
  transcript_text TEXT,
  transcript_json JSONB,
  word_count INTEGER,
  ai_quality_score TEXT CHECK (ai_quality_score IN ('A','B','C','D')),
  ai_quality_notes TEXT,
  pricing_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (pricing_tier IN ('free','standard')),
  amount_charged NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'CAD',
  stripe_session_id TEXT,
  payment_status TEXT DEFAULT 'none'
    CHECK (payment_status IN ('none','pending','paid','refunded')),
  human_review_requested BOOLEAN DEFAULT FALSE,
  human_review_tier TEXT CHECK (human_review_tier IN ('standard','rush')),
  human_review_vendor_id UUID REFERENCES vendors(id),
  human_review_completed_at TIMESTAMPTZ,
  human_reviewed_text TEXT,
  translation_requested BOOLEAN DEFAULT FALSE,
  translation_type TEXT CHECK (translation_type IN ('ai_instant','human_reviewed','certified')),
  translation_target_language_id UUID REFERENCES languages(id),
  translated_text TEXT,
  translation_order_id UUID REFERENCES orders(id),
  delivery_formats TEXT[] DEFAULT ARRAY['txt'],
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_transcription_jobs_email ON transcription_jobs (customer_email);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_transcription_jobs_created ON transcription_jobs (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_transcription_jobs_expires ON transcription_jobs (expires_at) WHERE expires_at IS NOT NULL AND status != 'expired';
CREATE INDEX idx_transcription_jobs_payment ON transcription_jobs (payment_status) WHERE payment_status = 'pending';

CREATE OR REPLACE FUNCTION transcription_jobs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transcription_jobs_updated_at
  BEFORE UPDATE ON transcription_jobs
  FOR EACH ROW EXECUTE FUNCTION transcription_jobs_set_updated_at();

CREATE TABLE transcription_email_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, usage_date)
);

CREATE INDEX idx_transcription_email_usage_lookup
  ON transcription_email_usage (email, usage_date);

CREATE TABLE transcription_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  session_token TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcription_otps_email ON transcription_otps (email, created_at DESC);
CREATE INDEX idx_transcription_otps_session ON transcription_otps (session_token) WHERE session_token IS NOT NULL;

CREATE TABLE transcription_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES transcription_jobs(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer','staff','system','vendor')),
  actor_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcription_audit_job ON transcription_audit_log (job_id, created_at DESC);

ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_email_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access" ON transcription_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON transcription_email_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON transcription_otps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON transcription_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "staff read all" ON transcription_jobs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read all" ON transcription_email_usage
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff read audit" ON transcription_audit_log
  FOR SELECT TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transcription-uploads',
  'transcription-uploads',
  false,
  524288000,
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
    'audio/ogg', 'audio/flac', 'audio/webm',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "transcription_uploads_service_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'transcription-uploads');

CREATE POLICY "transcription_uploads_service_select" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'transcription-uploads');

CREATE POLICY "transcription_uploads_service_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'transcription-uploads');

INSERT INTO app_settings (setting_key, setting_value, setting_type, description) VALUES
  ('transcription_free_tier_max_seconds', '60', 'number', 'Max audio duration in seconds for free tier'),
  ('transcription_free_tier_daily_limit', '5', 'number', 'Max free transcriptions per email per day'),
  ('transcription_price_per_minute', '0.15', 'number', 'CAD per audio minute for standard tier'),
  ('transcription_human_review_price_standard', '1.25', 'number', 'CAD per minute for standard human review'),
  ('transcription_human_review_price_rush', '1.75', 'number', 'CAD per minute for rush human review'),
  ('transcription_ai_translation_price', '0.25', 'number', 'CAD per minute for AI translation add-on'),
  ('transcription_free_expiry_days', '7', 'number', 'Days before free tier files auto-deleted'),
  ('transcription_paid_expiry_days', '30', 'number', 'Days before paid tier files auto-deleted'),
  ('transcription_primary_provider', 'assemblyai', 'string', 'Primary STT provider'),
  ('transcription_fallback_provider', 'openai', 'string', 'Fallback STT provider'),
  ('transcription_enabled', 'true', 'boolean', 'Master toggle for transcription service')
ON CONFLICT (setting_key) DO NOTHING;
