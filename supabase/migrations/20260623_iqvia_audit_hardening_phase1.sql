-- IQVIA audit hardening — Phase 1 (data integrity & security)
-- 2026-06-23. Applied to prod via MCP, then committed (repo mirrors prod).
-- All three changes are reversible.
--
-- Context: pre-IQVIA EQA-Vendor readiness audit of the supplier recruitment /
-- linguist-qualification process. This phase closes three concrete gaps that
-- need no human verification:
--   * AI was minting "verified" qualifying competence evidence (indefensible).
--   * Two XTRF financial import-staging tables lacked RLS.
--   * 34 confidentiality agreements were not bound to their recruitment
--     application (traceability).

-- 1. Lock down XTRF financial import-staging tables (created without RLS).
--    Service-role (admin import/reconciliation) bypasses RLS; anon/authenticated
--    get no access. These tables are import staging, not read by the client UI.
ALTER TABLE public.xtrf_csv_invoices_2026_06_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xtrf_csv_vendor_invoices_2026_06_10 ENABLE ROW LEVEL SECURITY;

-- 2. Stop AI from minting "verified" (Tier-2 qualifying) competence evidence.
--    ISO 17100 §3.1.4 / data integrity: verifying a credential is a human act.
--    Existing ai_auto_verified rows are left untouched (flagged for human review
--    separately). Reversible: set back to true to restore throughput.
UPDATE qms.config
SET value = 'false'::jsonb, updated_at = now()
WHERE key = 'ai_autoverify_enabled';

-- 3. Bind the confidentiality agreements that uniquely match a recruitment
--    application by signer email (NC-3 residual = 34 rows). Legacy NDAs with no
--    application (447) are correctly bound by vendor_id and left as-is; the 2
--    ambiguous (email maps to >1 application) are left for human review.
WITH uniq AS (
  SELECT lower(email) AS email, (array_agg(id))[1] AS app_id
  FROM cvp_applications
  GROUP BY lower(email)
  HAVING count(*) = 1
)
UPDATE vendor_nda_signatures n
SET application_id = u.app_id
FROM uniq u
WHERE n.application_id IS NULL
  AND n.signed_email IS NOT NULL
  AND lower(n.signed_email) = u.email;
