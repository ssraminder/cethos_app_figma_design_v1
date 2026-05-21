-- Tax-exempt flag on customers. When true, invoice generation should
-- skip Canadian tax (GST/HST). Auto-backfilled true for non-Canadian
-- billing_country; staff can toggle individually.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.is_tax_exempt IS
  'When true, invoice generation does not apply Canadian tax (GST/HST). '
  'Auto-set true on non-Canadian billing_country, staff can override.';

CREATE INDEX IF NOT EXISTS customers_is_tax_exempt_idx
  ON public.customers (is_tax_exempt) WHERE is_tax_exempt = true;

UPDATE public.customers
SET is_tax_exempt = true
WHERE billing_country IS NOT NULL
  AND billing_country <> ''
  AND billing_country NOT ILIKE '%canad%'
  AND is_tax_exempt = false;
