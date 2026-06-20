-- Auto-triage of inbound recruitment replies (cvp-inbound-email).
-- AI already analyses every threaded reply; this lets the deterministic router
-- ACT on safe/reversible recommendations (acknowledge / request_more_info /
-- send_test). approve & reject are NEVER auto (irreversible onboarding + the
-- applicant email is untrusted input) — they stay one-click HITL.
--
-- Widen the audit constraints to record the new outcomes and seed the
-- kill-switch config (default OFF). Applied to prod via MCP 2026-06-20.

-- 1) cvp_inbound_emails.action_taken: add 'auto_triaged'
ALTER TABLE public.cvp_inbound_emails
  DROP CONSTRAINT IF EXISTS cvp_inbound_emails_action_taken_check;
ALTER TABLE public.cvp_inbound_emails
  ADD CONSTRAINT cvp_inbound_emails_action_taken_check
  CHECK (
    action_taken IS NULL OR action_taken = ANY (ARRAY[
      'do_not_contact_set','auto_reply_sent','auto_reply_failed','noop',
      'threaded_received','upload_redirect_sent','auto_triaged'
    ])
  );

-- 2) cvp_application_decisions.action: add 'auto_acknowledged','auto_triaged'
ALTER TABLE public.cvp_application_decisions
  DROP CONSTRAINT IF EXISTS cvp_application_decisions_action_check;
ALTER TABLE public.cvp_application_decisions
  ADD CONSTRAINT cvp_application_decisions_action_check
  CHECK (action = ANY (ARRAY[
    'approved','rejected','waitlisted','info_requested',
    'prescreen_advanced','prescreen_manual_review','prescreen_silent',
    'auto_acknowledged','auto_triaged'
  ]));

-- 3) Kill-switch config, default OFF. acting_staff_id = accountable actor when enabled.
INSERT INTO public.cvp_system_config (key, value)
VALUES ('inbound_auto_triage', '{"enabled": false, "acting_staff_id": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;
