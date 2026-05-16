-- 20260515_workflow_state_machine_consistency.sql
--
-- Three small consistency fixes for the vendor-job state machine, surfaced
-- by an end-to-end workflow audit on 2026-05-14.
--
-- 1. vendor_step_offers.counter_round: tracks how many counter rounds an
--    offer has been through. Bumped by vendor-counter-offer every time the
--    vendor proposes a counter. Used as both audit history and as a guard
--    so a vendor cannot silently overwrite a previously-decided counter
--    (counter_status='accepted'/'rejected') without forcing a new round.
--
-- 2. step_deliveries.review_status: vocabulary unification. Admin's
--    staff-deliver-step writes 'pending_review'; vendor's vendor-deliver-step
--    used to write 'pending'. Downstream filters that expect 'pending_review'
--    missed vendor-delivered rows. Backfill any extant 'pending' rows.
--    (Edge-function code-side fixes ship alongside this migration.)
--
-- 3. No schema change for the counter-accept payable status fix — that's a
--    one-line edge function fix in admin-respond-counter-offer. Listed here
--    for completeness only.

BEGIN;

-- 1. counter_round on vendor_step_offers ----------------------------------
ALTER TABLE public.vendor_step_offers
  ADD COLUMN IF NOT EXISTS counter_round integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.vendor_step_offers.counter_round IS
  'Number of counter rounds the vendor has proposed on this offer. 0 = no counter yet. Bumped by vendor-counter-offer.';

-- Existing rows with a counter set should be considered round 1 minimum so
-- the guard in vendor-counter-offer (requires bump on each new proposal)
-- starts from a sensible baseline.
UPDATE public.vendor_step_offers
SET counter_round = 1
WHERE counter_at IS NOT NULL
  AND counter_round = 0;

-- 2. step_deliveries.review_status backfill -------------------------------
-- Unify on 'pending_review' to match staff-deliver-step.
UPDATE public.step_deliveries
SET review_status = 'pending_review'
WHERE review_status = 'pending';

COMMIT;
