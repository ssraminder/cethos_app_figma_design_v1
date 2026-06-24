-- 20260624_cvp_resurface_info_requested
-- Complements 20260624_approval_queue_ready_exclude_info_requested: that gate hides
-- info_requested applicants from 'ready' so an open request doesn't clutter the queue.
-- This sweep RE-SURFACES them (info_requested -> staff_review) once they actually respond,
-- so responders aren't buried forever. The approval-queue bucket then re-evaluates them
-- (they re-enter 'ready' only if they now meet NDA + EN->native target + a valid §3.1.4 basis).
--
-- PRECISION: fires only on application-tied response signals — a new received reference,
-- a new applicant-added general combo (target pair), or new application-tied competence
-- evidence (source_cvp_application_id). It deliberately does NOT use the vendor-email join
-- for evidence: that matches the screening pipeline's same-day evidence rows (noise) and
-- would wrongly re-surface non-responders (incl. the screener false-positive "degrees").
--
-- KNOWN GAP: document UPLOADS are not detected here, because the upload/AI-screen flow
-- creates qms.competence_evidence WITHOUT source_cvp_application_id (so it isn't tied to the
-- application). To auto-resurface degree re-uploads, fix the upload flow to set
-- source_cvp_application_id on screened evidence (or reset application status on upload).
-- Applied to prod via MCP 2026-06-24; scheduled via pg_cron every 4h (jobid 1846).

CREATE OR REPLACE FUNCTION public.cvp_resurface_info_requested()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, qms AS $$
DECLARE v_count int;
BEGIN
  WITH resurfaced AS (
    UPDATE cvp_applications a
    SET status = 'staff_review',
        updated_at = now(),
        staff_review_notes = COALESCE(a.staff_review_notes,'') || E'\n[auto-resurface ' || to_char(now(),'YYYY-MM-DD') || '] Applicant responded after the info request (new reference / target / application-tied document); returned to staff review for re-evaluation.'
    WHERE a.status = 'info_requested'
      AND a.staff_reviewed_at IS NOT NULL
      AND (
            EXISTS (SELECT 1 FROM cvp_application_references r
                    WHERE r.application_id = a.id AND r.status = 'received'
                      AND r.feedback_received_at > a.staff_reviewed_at)
         OR EXISTS (SELECT 1 FROM cvp_test_combinations c
                    WHERE c.application_id = a.id AND c.created_at > a.staff_reviewed_at
                      AND c.domain = 'general' AND c.source_language_id IS NOT NULL AND c.target_language_id IS NOT NULL)
         OR EXISTS (SELECT 1 FROM qms.competence_evidence ce
                    WHERE ce.source_cvp_application_id = a.id AND ce.created_at > a.staff_reviewed_at)
      )
    RETURNING a.id
  )
  SELECT count(*) INTO v_count FROM resurfaced;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.cvp_resurface_info_requested() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cvp_resurface_info_requested() TO service_role;

-- Schedule every 4h (idempotent).
SELECT cron.unschedule('cvp-resurface-info-requested') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cvp-resurface-info-requested');
SELECT cron.schedule('cvp-resurface-info-requested', '17 */4 * * *', $$SELECT public.cvp_resurface_info_requested();$$);
