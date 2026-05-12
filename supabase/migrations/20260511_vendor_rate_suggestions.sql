-- AI-generated vendor rate suggestions. Audit trail of every Claude call:
-- what inputs it saw, what it suggested, and what staff actually accepted.
-- Used by cvp-suggest-vendor-rate.

CREATE TABLE IF NOT EXISTS vendor_rate_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  application_id UUID,

  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  calculation_unit TEXT NOT NULL DEFAULT 'per_page',

  recommended_rate NUMERIC(10,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  alternative_higher NUMERIC(10,4),
  alternative_lower NUMERIC(10,4),
  confidence NUMERIC(3,2),
  ai_reasoning TEXT,

  client_rate_used NUMERIC(10,4) NOT NULL,
  client_rate_source TEXT NOT NULL,
  pool_p25 NUMERIC(10,4),
  pool_median NUMERIC(10,4),
  pool_p75 NUMERIC(10,4),
  pool_n INT,
  margin_multiplier NUMERIC(4,3) NOT NULL DEFAULT 0.30,
  test_score_used INT,
  test_bucket TEXT,

  model_version TEXT,
  prompt_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id UUID,
  accepted_rate NUMERIC(10,4),
  accepted_at TIMESTAMPTZ,
  accepted_by_staff_id UUID,
  vendor_rate_id UUID REFERENCES vendor_rates(id) ON DELETE SET NULL,

  CHECK (vendor_id IS NOT NULL OR application_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vendor_rate_suggestions_vendor
  ON vendor_rate_suggestions (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_rate_suggestions_application
  ON vendor_rate_suggestions (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_rate_suggestions_lane
  ON vendor_rate_suggestions (source_language, target_language, service_id, calculation_unit);
