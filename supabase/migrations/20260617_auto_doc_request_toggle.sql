-- Phase 1 recruitment automation — auto documentation-request toggle.
--
-- When enabled, cvp-prescreen-application automatically emails an applicant for
-- any missing required documentation (CV, credential/§3.1.4 evidence, work
-- samples) via cvp-request-info (internal-auto path) and sets
-- status='info_requested' + logs to cvp_application_decisions — instead of
-- parking the application in staff_review for a human to chase manually.
--
-- Default OFF. Flipped on only after end-to-end verification on @example.com
-- test applicants. Mirrors the existing auto_approve gate. Final approval and
-- the activation/welcome email remain human-only.
INSERT INTO public.cvp_system_config (key, value, description)
VALUES (
  'auto_doc_request',
  '{"enabled": false, "acting_staff_id": null}'::jsonb,
  'Recruitment auto documentation-request. When enabled, the prescreen step automatically emails applicants for any missing required documentation and sets status=info_requested, instead of leaving them in staff_review. Final approval + activation email remain human.'
)
ON CONFLICT (key) DO NOTHING;
