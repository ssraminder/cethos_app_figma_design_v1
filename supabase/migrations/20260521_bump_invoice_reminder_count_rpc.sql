-- Helper used by send-payment-reminders to atomically stamp last_reminder_sent_at
-- and increment reminder_count for a batch of invoice ids.

CREATE OR REPLACE FUNCTION public.bump_invoice_reminder_count(
  invoice_ids uuid[],
  stamp_at timestamptz
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.customer_invoices
     SET last_reminder_sent_at = stamp_at,
         reminder_count = COALESCE(reminder_count, 0) + 1,
         updated_at = stamp_at
   WHERE id = ANY(invoice_ids);
  SELECT array_length(invoice_ids, 1);
$$;

REVOKE ALL ON FUNCTION public.bump_invoice_reminder_count(uuid[], timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_invoice_reminder_count(uuid[], timestamptz) TO service_role;
