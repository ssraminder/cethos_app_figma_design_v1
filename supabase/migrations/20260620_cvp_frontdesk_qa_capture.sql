-- Phase 2a: auto-build a QA knowledge base from human answers to front-desk
-- escalations. Escalations carry a [#ESC-token]; staff replies route back through
-- vm@cethos.com, get relayed (AI-polished) to the applicant, and the
-- question->answer pair is captured as a draft KB entry (human-approval-gated
-- before any future reuse). Applied to prod via MCP 2026-06-20.

CREATE TABLE IF NOT EXISTS public.cvp_frontdesk_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  original_message_id text,
  original_from_email text NOT NULL,
  original_from_name text,
  original_subject text,
  original_body text,
  matched_application_id uuid,
  intent text,
  escalation_email text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  answered_by_email text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cvp_frontdesk_escalations_token_idx ON public.cvp_frontdesk_escalations(token);

CREATE TABLE IF NOT EXISTS public.cvp_kb_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text text NOT NULL,
  answer_text text NOT NULL,
  source_escalation_id uuid REFERENCES public.cvp_frontdesk_escalations(id),
  source_application_id uuid,
  authored_by_email text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cvp_kb_entries_status_idx ON public.cvp_kb_entries(status);

-- New inbound outcomes for the staff-answer capture/relay path.
ALTER TABLE public.cvp_inbound_emails
  DROP CONSTRAINT IF EXISTS cvp_inbound_emails_action_taken_check;
ALTER TABLE public.cvp_inbound_emails
  ADD CONSTRAINT cvp_inbound_emails_action_taken_check
  CHECK (
    action_taken IS NULL OR action_taken = ANY (ARRAY[
      'do_not_contact_set','auto_reply_sent','auto_reply_failed','noop',
      'threaded_received','upload_redirect_sent','auto_triaged',
      'frontdesk_replied','frontdesk_escalated','frontdesk_dropped',
      'qa_relayed','qa_capture_failed'
    ])
  );

ALTER TABLE public.cvp_inbound_emails
  DROP CONSTRAINT IF EXISTS cvp_inbound_emails_classified_intent_check;
ALTER TABLE public.cvp_inbound_emails
  ADD CONSTRAINT cvp_inbound_emails_classified_intent_check
  CHECK (
    classified_intent IS NULL OR classified_intent = ANY (ARRAY[
      'unsubscribe','other','unmatched','error','reply_to_outbound',
      'document_submission','staff_qa_reply'
    ])
  );
