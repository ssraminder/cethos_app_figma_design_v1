/* ISO 17100 §4.6 audit trail — close the split-step gap.
 *
 * Background:
 *   split-step (deployed 2026-06-08) was meant to write a
 *   qms.assignment_eligibility_events row per vendor child via the standard
 *   public.qms_check_assignment RPC. It never reached the table because:
 *
 *     1. The edge fn was doing a direct INSERT via PostgREST instead of
 *        the SECURITY DEFINER RPC. The qms schema isn't exposed to
 *        PostgREST, so the call silently 404'd.
 *     2. Even after switching to the RPC, the check constraint
 *        `assignment_eligibility_events_call_site_check` whitelisted
 *        seven call_site values — split_step was not among them.
 *
 *   Result: every split since 2026-06-08 was missing its audit row, even
 *   though §4.6 requires every assignment decision to be reproducible.
 *
 * This migration:
 *   - Adds 'split_step' to the whitelist
 *   - Backfills audit rows for vendor children created before this fix,
 *     marking them payload->>'backfilled'=true so a Stage 2 auditor can
 *     tell reconstructed rows from real-time ones
 *
 * The accompanying edge fn change (split-step v6) swaps the direct INSERT
 * for `supabase.rpc('qms_check_assignment', { p_call_site: 'split_step', ... })`.
 * That RPC is the same one update-workflow-step uses for direct-assign and
 * offer-accept on regular steps — so the audit trail is now uniform regardless
 * of how a vendor reaches a workflow step.
 */

ALTER TABLE qms.assignment_eligibility_events
DROP CONSTRAINT IF EXISTS assignment_eligibility_events_call_site_check;

ALTER TABLE qms.assignment_eligibility_events
ADD CONSTRAINT assignment_eligibility_events_call_site_check
CHECK (call_site = ANY (ARRAY[
  'find_matching_vendors'::text,
  'direct_assign'::text,
  'offer_vendor'::text,
  'offer_multiple'::text,
  'counter_offer_accept'::text,
  'cvp_approve_application'::text,
  'manual_check'::text,
  'split_step'::text
]));

/* --- Backfill --- */
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.id AS child_step_id, c.order_id, c.vendor_id, c.assigned_at,
           c.partition_index, c.parent_step_id,
           p.source_language, p.target_language, p.service_id
      FROM order_workflow_steps c
      JOIN order_workflow_steps p ON p.id = c.parent_step_id
     WHERE c.parent_step_id IS NOT NULL
       AND c.vendor_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM qms.assignment_eligibility_events e
          WHERE e.workflow_step_id = c.id AND e.call_site = 'split_step'
       )
  ) LOOP
    PERFORM public.qms_check_assignment(
      p_vendor_id := r.vendor_id,
      p_service_id := r.service_id,
      p_source_language_code := r.source_language,
      p_target_language_code := r.target_language,
      p_call_site := 'split_step',
      p_order_id := r.order_id,
      p_workflow_step_id := r.child_step_id,
      p_vendor_step_offer_id := NULL,
      p_payload := jsonb_build_object(
        'parent_step_id', r.parent_step_id,
        'partition_index', r.partition_index,
        'assignee_kind', 'vendor',
        'backfilled', true,
        'backfill_reason', 'pre-2026-06-09 split-step did not log audit rows; reconstructed from order_workflow_steps state',
        'original_assigned_at', r.assigned_at::text
      )
    );
  END LOOP;
END $$;
