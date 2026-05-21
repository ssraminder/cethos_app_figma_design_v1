-- Backfill tax_amount / subtotal / tax_rate on XTRF-imported customer_invoices.
-- The initial materialization didn't carry tax across — only total_amount.
-- This recomputes tax = (gross - netto) from the xtrf_customer_invoice_cache
-- and updates the portal row idempotently.
--
-- Safe to re-run: WHERE clause skips rows already in sync.

UPDATE public.customer_invoices ci
SET subtotal       = src.new_subtotal,
    subtotal_cad   = src.new_subtotal,
    tax_amount     = src.new_tax,
    tax_amount_cad = src.new_tax,
    tax_rate       = src.new_rate
FROM (
  SELECT
    ci.id,
    cic.total_netto AS new_subtotal,
    GREATEST(cic.total_gross - cic.total_netto, 0) AS new_tax,
    CASE WHEN cic.total_netto > 0
         THEN ROUND(((cic.total_gross - cic.total_netto)::numeric / cic.total_netto) * 100, 4)
         ELSE 0
    END AS new_rate
  FROM public.customer_invoices ci
  JOIN public.xtrf_customer_invoice_cache cic ON cic.id = ci.xtrf_invoice_id
  WHERE ci.xtrf_invoice_id IS NOT NULL
) src
WHERE ci.id = src.id
  AND (ci.tax_amount IS DISTINCT FROM src.new_tax
       OR ci.subtotal IS DISTINCT FROM src.new_subtotal);
