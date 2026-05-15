-- 20260515_iso_quiz_p1_schema
--
-- P1 schema for the applicant-choice test-or-quiz routing.
-- Companion to docs/qms/02-test-or-quiz-routing.md §4.
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.
--
-- Adds:
--   1. cvp_applications.instrument_choice (+_at, +_by)
--   2. cvp_test_combinations.instrument_kind
--   3. cvp_quiz_submissions table (mirrors cvp_test_submissions lifecycle)

-- 1) cvp_applications — applicant's choice of assessment path + the
-- token the applicant uses to reach the choose-your-assessment page.
ALTER TABLE cvp_applications
  ADD COLUMN IF NOT EXISTS instrument_choice text NULL,
  ADD COLUMN IF NOT EXISTS instrument_choice_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS instrument_choice_by uuid NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instrument_choice_token uuid NULL,
  ADD COLUMN IF NOT EXISTS instrument_choice_token_expires_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cvp_applications_instrument_choice_token
  ON cvp_applications (instrument_choice_token)
  WHERE instrument_choice_token IS NOT NULL;

COMMENT ON COLUMN cvp_applications.instrument_choice_token IS
  'Token used by the applicant to reach the choose-your-assessment page. Issued by cvp-send-tests phase 1; valid until the applicant commits a choice or token expires (240h). Nulled when instrument_choice is set so the URL becomes single-use.';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cvp_applications_instrument_choice_check'
  ) THEN
    ALTER TABLE cvp_applications
      ADD CONSTRAINT cvp_applications_instrument_choice_check
        CHECK (instrument_choice IS NULL OR instrument_choice IN ('test','quiz'));
  END IF;
END $$;

COMMENT ON COLUMN cvp_applications.instrument_choice IS
  'Applicant''s choice between assessment paths: test = translation test(s), quiz = ISO competence quiz. NULL until choose-your-assessment page is committed. See docs/qms/02-test-or-quiz-routing.md §2.';
COMMENT ON COLUMN cvp_applications.instrument_choice_by IS
  'Staff user who pre-selected the path on the applicant''s behalf. NULL when the applicant chose themselves.';

-- 2) cvp_test_combinations — which instrument actually ran for this combo
ALTER TABLE cvp_test_combinations
  ADD COLUMN IF NOT EXISTS instrument_kind text NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cvp_test_combinations_instrument_kind_check'
  ) THEN
    ALTER TABLE cvp_test_combinations
      ADD CONSTRAINT cvp_test_combinations_instrument_kind_check
        CHECK (instrument_kind IS NULL OR instrument_kind IN ('test','quiz','skip'));
  END IF;
END $$;

COMMENT ON COLUMN cvp_test_combinations.instrument_kind IS
  'The instrument actually dispatched for this combination. NULL while combo is in pending state and no instrument has been chosen/sent yet. Populated and immutable once a test or quiz is dispatched.';

-- 3) cvp_quiz_submissions — keyed (application_id, target_language_id).
-- One quiz per (applicant, target language) settles ALL of that applicant's
-- pending combinations targeting that language.
CREATE TABLE IF NOT EXISTS cvp_quiz_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES cvp_applications(id) ON DELETE CASCADE,
  target_language_id uuid NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','submitted','expired','archived')),
  -- Applicant responses: array of { question_id, selected_option }
  responses jsonb,
  -- Deterministic grading results
  score_pct numeric(5,2),
  correct_count integer,
  total_count integer,
  -- Per-competence breakdown: { competence_slug: { correct, total } }
  competence_breakdown jsonb,
  submitted_at timestamptz,
  -- Reminder cadence mirrors cvp_test_submissions for cvp-check-test-followups reuse
  reminder_1_sent_at timestamptz,
  reminder_2_sent_at timestamptz,
  reminder_3_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cvp_quiz_submissions_application
  ON cvp_quiz_submissions (application_id);
CREATE INDEX IF NOT EXISTS idx_cvp_quiz_submissions_status_expires
  ON cvp_quiz_submissions (status, token_expires_at)
  WHERE status IN ('sent','viewed');

-- RLS — staff read+update; applicant access only via service-role-keyed
-- edge functions using the token.
ALTER TABLE cvp_quiz_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read cvp_quiz_submissions" ON cvp_quiz_submissions;
CREATE POLICY "Staff can read cvp_quiz_submissions"
  ON cvp_quiz_submissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM staff_users
    WHERE staff_users.auth_user_id = auth.uid() AND staff_users.is_active = true
  ));

DROP POLICY IF EXISTS "Staff can update cvp_quiz_submissions" ON cvp_quiz_submissions;
CREATE POLICY "Staff can update cvp_quiz_submissions"
  ON cvp_quiz_submissions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM staff_users
    WHERE staff_users.auth_user_id = auth.uid() AND staff_users.is_active = true
  ));

DROP POLICY IF EXISTS "Service role full access cvp_quiz_submissions" ON cvp_quiz_submissions;
CREATE POLICY "Service role full access cvp_quiz_submissions"
  ON cvp_quiz_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION cvp_quiz_submissions_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cvp_quiz_submissions_set_updated_at ON cvp_quiz_submissions;
CREATE TRIGGER cvp_quiz_submissions_set_updated_at
  BEFORE UPDATE ON cvp_quiz_submissions
  FOR EACH ROW EXECUTE FUNCTION cvp_quiz_submissions_touch_updated_at();
