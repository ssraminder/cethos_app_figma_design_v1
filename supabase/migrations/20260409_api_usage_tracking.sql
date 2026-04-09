-- ============================================================================
-- Migration: API Usage & Cost Tracking + OCR Upload Limits
-- Date: 2026-04-09
-- Description:
--   1. Increase ocr-uploads bucket file_size_limit from 100MB to 250MB
--   2. Create api_usage_log table for tracking all API calls and costs
--   3. Add cost summary columns to ocr_batches and ocr_batch_files
-- ============================================================================

-- ============================================================================
-- 1. Increase ocr-uploads bucket file size limit to 250MB
-- ============================================================================

UPDATE storage.buckets
SET file_size_limit = 262144000  -- 250 * 1024 * 1024
WHERE id = 'ocr-uploads';

-- ============================================================================
-- 2. Create api_usage_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_usage_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context: what triggered this API call
  source_type     varchar(50) NOT NULL,          -- 'ocr_batch', 'quote_processing', 'manual'
  source_id       uuid,                          -- FK to ocr_batches.id or quotes.id
  batch_file_id   uuid,                          -- FK to ocr_batch_files.id (nullable)
  quote_id        uuid,                          -- FK to quotes.id (nullable)
  quote_file_id   uuid,                          -- FK to quote_files.id (nullable)

  -- API provider details
  provider        varchar(50) NOT NULL,          -- 'openai', 'anthropic', 'google_document_ai', 'aws_textract', 'mistral'
  model           varchar(100),                  -- 'gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.0-flash', etc.
  operation       varchar(100) NOT NULL,         -- 'ocr', 'document_analysis', 'language_detection', 'embedding', etc.

  -- Token usage (for LLM APIs)
  input_tokens    integer DEFAULT 0,
  output_tokens   integer DEFAULT 0,
  total_tokens    integer DEFAULT 0,

  -- Page/unit usage (for OCR APIs like Document AI, Textract)
  pages_processed integer DEFAULT 0,

  -- Cost calculation
  cost_usd        numeric(10, 6) NOT NULL DEFAULT 0,  -- Cost in USD (6 decimal places for micro-costs)

  -- Performance
  processing_time_ms  integer,
  status          varchar(20) DEFAULT 'success', -- 'success', 'failed', 'partial'
  error_message   text,

  -- Metadata
  request_metadata  jsonb,                       -- Additional provider-specific data (request ID, region, etc.)
  response_metadata jsonb,                       -- Token breakdown, rate limits, etc.

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_api_usage_log_source
  ON api_usage_log (source_type, source_id);

CREATE INDEX idx_api_usage_log_provider
  ON api_usage_log (provider, created_at);

CREATE INDEX idx_api_usage_log_quote
  ON api_usage_log (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX idx_api_usage_log_batch_file
  ON api_usage_log (batch_file_id)
  WHERE batch_file_id IS NOT NULL;

CREATE INDEX idx_api_usage_log_created
  ON api_usage_log (created_at);

-- ============================================================================
-- 3. Add cost tracking columns to ocr_batch_files
-- ============================================================================

ALTER TABLE ocr_batch_files
  ADD COLUMN IF NOT EXISTS total_api_cost_usd  numeric(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_input_tokens   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_output_tokens  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pages_ocrd     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS api_calls_count      integer DEFAULT 0;

-- ============================================================================
-- 4. Add cost summary columns to ocr_batches
-- ============================================================================

ALTER TABLE ocr_batches
  ADD COLUMN IF NOT EXISTS total_api_cost_usd  numeric(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_input_tokens   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_output_tokens  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pages_ocrd     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS api_calls_count      integer DEFAULT 0;

-- ============================================================================
-- 5. Add cost tracking to ai_analysis_results (for quote processing flow)
-- ============================================================================

ALTER TABLE ai_analysis_results
  ADD COLUMN IF NOT EXISTS total_api_cost_usd  numeric(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_input_tokens   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_output_tokens  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens         integer DEFAULT 0;

-- ============================================================================
-- 6. RLS Policies for api_usage_log (staff-only access)
-- ============================================================================

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view api usage logs"
  ON api_usage_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff_users
      WHERE staff_users.id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert api usage logs"
  ON api_usage_log FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 7. Helper view for cost summaries by period
-- ============================================================================

CREATE OR REPLACE VIEW api_usage_summary AS
SELECT
  date_trunc('day', created_at) AS usage_date,
  provider,
  operation,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(pages_processed) AS total_pages,
  SUM(cost_usd) AS total_cost_usd,
  AVG(processing_time_ms) AS avg_processing_time_ms
FROM api_usage_log
GROUP BY date_trunc('day', created_at), provider, operation;
