-- Idempotency column for invoices imported from XTRF.
ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS xtrf_invoice_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoices_xtrf_invoice_id_key
  ON public.customer_invoices (xtrf_invoice_id)
  WHERE xtrf_invoice_id IS NOT NULL;

COMMENT ON COLUMN public.customer_invoices.xtrf_invoice_id IS
  'XTRF source invoice id. NULL for portal-native invoices. Unique when set.';
