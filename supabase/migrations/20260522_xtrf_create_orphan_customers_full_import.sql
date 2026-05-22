-- Create stub customers for the few CSV invoice clients that have no
-- matching XTRF customer record AND no matching portal customer. These
-- are mostly individual retail clients we never imported. ~10 rows.
--
-- Aliases handled in the invoice INSERT (Transperfect/Zab spelled
-- differently in CSV than in portal — those are mapped, not stubbed).

INSERT INTO public.customers (
  email,
  full_name,
  company_name,
  customer_type,
  billing_country,
  preferred_currency,
  currency,
  invoicing_branch_id,
  is_tax_exempt,
  payment_terms,
  is_ar_customer,
  created_at,
  updated_at
)
SELECT DISTINCT ON (LOWER(TRIM(m.client_name)))
  'xtrf-orphan-' || lower(regexp_replace(m.client_name, '[^A-Za-z0-9]+', '-', 'g')) || '@imported.cethos.com' AS email,
  m.client_name AS full_name,
  NULL AS company_name,
  'individual' AS customer_type,
  'Canada' AS billing_country,
  'CAD' AS preferred_currency,
  'CAD' AS currency,
  2 AS invoicing_branch_id,
  false AS is_tax_exempt,
  'net_30' AS payment_terms,
  false AS is_ar_customer,
  COALESCE(MIN(m.invoice_date_final)::timestamptz, now()) AS created_at,
  now() AS updated_at
FROM (
  SELECT i.client_name, i.invoice_date_final
  FROM xtrf_csv_invoices_2026_05_21 i
  LEFT JOIN customer_invoices ci ON ci.invoice_number = i.invoice_number
  WHERE i.invoice_number IS NOT NULL
    AND i.invoice_number <> 'Number not assigned'
    AND i.invoice_status <> 'CANCELLED'
    AND ci.id IS NULL
) m
LEFT JOIN customers c ON LOWER(TRIM(COALESCE(c.company_name, c.full_name))) = LOWER(TRIM(m.client_name))
WHERE c.id IS NULL
  AND m.client_name NOT IN (
    'Transperfect Translations Ltd.',
    'operations@zabtranslation.com'
  )
  AND TRIM(m.client_name) <> ''
GROUP BY m.client_name
ORDER BY LOWER(TRIM(m.client_name)), MIN(m.invoice_date_final);
