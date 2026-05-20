-- Final-version tracking on a workflow step. Admin picks one of the
-- step_deliveries rows as THE final to send to the customer; everything
-- prior stays as version history but the final is the one converted to
-- watermarked PDF for the customer draft.
ALTER TABLE public.order_workflow_steps
  ADD COLUMN IF NOT EXISTS final_delivery_id uuid REFERENCES public.step_deliveries(id),
  ADD COLUMN IF NOT EXISTS final_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_marked_by uuid;

-- Tracks each draft-to-customer email so staff can see who sent the
-- last preview, when, and to whom. Mirrors the notification_log pattern
-- but keyed on the workflow step so the admin UI can surface it inline.
CREATE TABLE IF NOT EXISTS public.step_draft_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id         uuid NOT NULL REFERENCES public.order_workflow_steps(id) ON DELETE CASCADE,
  delivery_id     uuid REFERENCES public.step_deliveries(id),
  pdf_storage_path text,
  pdf_bytes       integer,
  recipient_email text NOT NULL,
  recipient_name  text,
  cc_emails       text[] DEFAULT '{}',
  subject         text NOT NULL,
  body_html       text,
  email_status    text NOT NULL CHECK (email_status IN ('sent', 'failed')),
  brevo_message_id text,
  error_message   text,
  sent_by         uuid,
  sent_by_name    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS step_draft_sends_step_id_idx ON public.step_draft_sends(step_id, created_at DESC);
ALTER TABLE public.step_draft_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY step_draft_sends_authenticated_read ON public.step_draft_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY step_draft_sends_service_all ON public.step_draft_sends FOR ALL TO service_role USING (true) WITH CHECK (true);
