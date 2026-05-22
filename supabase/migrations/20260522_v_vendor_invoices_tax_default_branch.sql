-- Recent XTRF vendor-invoice cache rows arrive with branch=null (sync regression
-- after 2026-04). Default any null cache.branch to branch_id 1 (Cethos Solutions
-- Inc., the parent corporate entity) so Tab 2 doesn't silently drop those rows.
-- When the XTRF sync starts populating branch again, this fallback becomes a
-- no-op for new data.

CREATE OR REPLACE VIEW public.v_vendor_invoices_tax AS
WITH cache_rows AS (
  SELECT
    c.id::text AS source_id,
    'xtrf_cache' AS source,
    COALESCE(c.final_number, c.draft_number, c.internal_number) AS invoice_number,
    c.vendor_name,
    c.final_date AS invoice_date,
    c.last_payment_date AS paid_at,
    c.status,
    c.payment_status,
    COALESCE(
      CASE c.branch
        WHEN 'Cethos Solutions Inc.' THEN 1
        WHEN '12537494 Canada Inc.' THEN 2
        WHEN 'Amrita Arora' THEN 4
        WHEN 'Cethos Solutions Inc. - Linguistic Validation Division' THEN 6
        ELSE NULL
      END,
      1
    ) AS branch_id,
    c.branch AS branch_text,
    c.total_netto AS subtotal_native,
    (c.total_gross - c.total_netto) AS tax_native,
    c.total_gross AS gross_native,
    c.netto_cad AS subtotal_cad,
    COALESCE(
      NULLIF(regexp_replace(COALESCE(csv.tax_amount, ''), '[^0-9.\-]', '', 'g'), '')::numeric,
      CASE
        WHEN c.total_netto > 0 AND c.netto_cad IS NOT NULL
          THEN ROUND(((c.total_gross - c.total_netto) * (c.netto_cad / c.total_netto))::numeric, 2)
        ELSE 0
      END
    ) AS tax_cad
  FROM public.xtrf_vendor_invoice_cache c
  LEFT JOIN public.xtrf_csv_vendor_invoices_2026_05_21 csv
    ON COALESCE(NULLIF(csv.invoice_no, ''), csv.internal_number) =
       COALESCE(c.final_number, c.draft_number, c.internal_number)
),
payable_rows AS (
  SELECT
    vp.id::text AS source_id,
    'vendor_payable' AS source,
    vp.vendor_invoice_number AS invoice_number,
    v.full_name AS vendor_name,
    vp.vendor_invoice_date AS invoice_date,
    vp.paid_at::date AS paid_at,
    vp.status,
    CASE WHEN vp.paid_at IS NOT NULL THEN 'Paid' ELSE 'Open' END AS payment_status,
    COALESCE(c.invoicing_branch_id, 1) AS branch_id,
    NULL::text AS branch_text,
    vp.subtotal AS subtotal_native,
    vp.tax_amount AS tax_native,
    vp.total AS gross_native,
    vp.subtotal_cad,
    ROUND((COALESCE(vp.tax_amount, 0) * COALESCE(vp.exchange_rate_to_cad, 1))::numeric, 2) AS tax_cad
  FROM public.vendor_payables vp
  LEFT JOIN public.vendors v ON v.id = vp.vendor_id
  LEFT JOIN public.orders o ON o.id = vp.order_id
  LEFT JOIN public.customers c ON c.id = o.customer_id
  WHERE vp.voided_at IS NULL
    AND vp.cancelled_at IS NULL
    AND vp.status NOT IN ('cancelled', 'voided', 'draft')
)
SELECT * FROM cache_rows
UNION ALL
SELECT * FROM payable_rows;

GRANT SELECT ON public.v_vendor_invoices_tax TO authenticated, service_role;
