-- Phase 1: HITL negotiation agent. Audit + future training data.

CREATE TABLE IF NOT EXISTS negotiation_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'hitl' CHECK (mode IN ('hitl','mixed','auto')),
  auto_confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.85,
  auto_max_uplift_pct NUMERIC(4,3) NOT NULL DEFAULT 0.05,
  auto_max_deadline_extension_hours INT NOT NULL DEFAULT 24,
  auto_only_for_services UUID[] NOT NULL DEFAULT '{}',
  notify_staff_email TEXT,
  require_unanimous_confidence BOOLEAN NOT NULL DEFAULT false,
  paused BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_staff_id UUID
);

INSERT INTO negotiation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS vendor_negotiation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES vendor_step_offers(id) ON DELETE CASCADE,
  vendor_id UUID,
  step_id UUID,
  application_id UUID,
  mode TEXT NOT NULL CHECK (mode IN ('hitl','auto')),
  trigger_event TEXT NOT NULL,
  original_rate NUMERIC(10,4),
  original_total NUMERIC(10,4),
  original_deadline TIMESTAMPTZ,
  counter_rate NUMERIC(10,4),
  counter_total NUMERIC(10,4),
  counter_deadline TIMESTAMPTZ,
  counter_note TEXT,
  client_rate_used NUMERIC(10,4),
  ceiling NUMERIC(10,4),
  anti_lowball_floor NUMERIC(10,4),
  pool_p25 NUMERIC(10,4),
  pool_median NUMERIC(10,4),
  pool_p75 NUMERIC(10,4),
  pool_n INT,
  vendor_country TEXT,
  vendor_col_bucket TEXT,
  vendor_experience_years INT,
  vendor_test_score INT,
  vendor_history_jobs_completed INT,
  vendor_history_accept_rate NUMERIC(3,2),
  vendor_history_avg_quality NUMERIC(4,2),
  ai_action TEXT NOT NULL CHECK (ai_action IN ('accept','reject','counter','escalate')),
  ai_proposed_rate NUMERIC(10,4),
  ai_proposed_total NUMERIC(10,4),
  ai_proposed_deadline TIMESTAMPTZ,
  ai_reasoning TEXT,
  ai_confidence NUMERIC(3,2),
  ai_concerns TEXT[],
  ai_data_references JSONB,
  ai_model_version TEXT,
  ai_prompt_version TEXT,
  staff_decision TEXT CHECK (staff_decision IN ('approved_ai','modified','overrode','rejected_ai')),
  staff_action TEXT CHECK (staff_action IN ('accept','reject','counter')),
  staff_rate NUMERIC(10,4),
  staff_total NUMERIC(10,4),
  staff_deadline TIMESTAMPTZ,
  staff_reason TEXT,
  decided_by_staff_id UUID,
  decided_at TIMESTAMPTZ,
  vendor_final_response TEXT,
  final_settled_rate NUMERIC(10,4),
  final_settled_at TIMESTAMPTZ,
  job_completed_on_time BOOLEAN,
  job_quality_score NUMERIC(4,2),
  superseded_by_id UUID REFERENCES vendor_negotiation_decisions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_negotiation_decisions_offer
  ON vendor_negotiation_decisions (offer_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_decisions_vendor
  ON vendor_negotiation_decisions (vendor_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_decisions_pending
  ON vendor_negotiation_decisions (offer_id, decided_at)
  WHERE decided_at IS NULL AND superseded_by_id IS NULL;
