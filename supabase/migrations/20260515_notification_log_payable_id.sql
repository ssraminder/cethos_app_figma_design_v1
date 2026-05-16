-- 20260515_notification_log_payable_id.sql
--
-- Adds notification_log.payable_id so payable-lifecycle emails
-- (payable_invoiced / payable_paid) can join back to vendor_payables
-- the same way offer-related emails join back via offer_id.
--
-- Companion to the notify-step-lifecycle helper introduced in the same PR.

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS payable_id uuid REFERENCES public.vendor_payables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notification_log_payable_id_idx
  ON public.notification_log(payable_id)
  WHERE payable_id IS NOT NULL;

COMMENT ON COLUMN public.notification_log.payable_id IS
  'Vendor payable this notification is about. Populated by payable_invoiced and payable_paid events.';
