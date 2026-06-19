-- New recruitment role: Cognitive Debriefing & Clinician Review Consultant
-- (value 'cd_clinician_consultant'). A recruitment/consulting role with NO
-- skills test/quiz — auto-approved to a parked vendor record (status 'applicant')
-- by cvp-auto-advance; never goes through the competence pipeline or the QMS
-- bridge. Consultant-specific fields are stored in consultant_profile jsonb.
-- Applied to prod via MCP 2026-06-19.
ALTER TABLE public.cvp_applications DROP CONSTRAINT cvp_applications_role_type_check;
ALTER TABLE public.cvp_applications ADD CONSTRAINT cvp_applications_role_type_check
  CHECK (role_type::text = ANY (ARRAY['translator','cognitive_debriefing','cd_clinician_consultant','interpreter','transcriber','clinician_reviewer','agency']::text[]));

ALTER TABLE public.cvp_applications ADD COLUMN IF NOT EXISTS consultant_profile jsonb;
