-- Add approved_excluded status to cvp_test_combinations.
-- Used when a combo passed the test (cascade-approved) but was intentionally
-- excluded from the operational translator-domain approval — e.g. a high-risk
-- domain (financial, legal) with no domain-specific evidence on file.
ALTER TABLE cvp_test_combinations
  DROP CONSTRAINT cvp_test_combinations_status_check;

ALTER TABLE cvp_test_combinations
  ADD CONSTRAINT cvp_test_combinations_status_check
  CHECK (status IN (
    'pending','no_test_available','test_assigned','test_sent',
    'test_submitted','assessed','approved','rejected','skipped',
    'skip_manual_review','approved_excluded'
  ));
