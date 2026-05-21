-- Per-customer opt-in for automatic invoice reminder emails.
-- Default false so the send-payment-reminders cron sends nothing until staff
-- explicitly enables it from the customer profile.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS auto_invoice_reminders_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.auto_invoice_reminders_enabled IS
  'When true, the send-payment-reminders cron may email this customer about overdue invoices. Default false so staff explicitly opt customers in.';

CREATE INDEX IF NOT EXISTS customers_auto_reminders_enabled_idx
  ON public.customers (auto_invoice_reminders_enabled)
  WHERE auto_invoice_reminders_enabled = true;
