-- ISO/COA qualification gate: screened-only evidence (AI-extracted CV) does NOT
-- make a vendor ISO/COA-qualified. A role qualification is only 'qualified' when
-- the vendor holds Tier-2 (document-verified) competence evidence. Screened-only
-- qualifications drop to 'under_review' (provisional) and return to 'qualified'
-- only once verified evidence is added (diploma, first-party records, reference).
-- Applied to prod via MCP 2026-06-18 (102 quals/55 vendors downgraded; 2 kept).

-- 1) Enforce going forward: screened evidence no longer satisfies the qualify
--    control (verified=true required).
UPDATE qms.config SET value = 'false'::jsonb, updated_at = now()
WHERE key = 'qualification_accept_screened_evidence';

-- 2) Downgrade existing screened-only qualifications to provisional.
UPDATE qms.role_qualifications rq
SET status = 'under_review',
    internal_notes = COALESCE(rq.internal_notes || E'\n', '')
      || '[2026-06-18] Downgraded qualified→under_review: evidence is screened-only '
      || '(AI-extracted CV); not ISO/COA-qualified until Tier-2 document-verified '
      || 'evidence is recorded.',
    updated_at = now()
WHERE rq.status = 'qualified'
  AND NOT EXISTS (
    SELECT 1 FROM qms.competence_evidence ce
    WHERE ce.vendor_id = rq.vendor_id
      AND ce.verified = true
      AND (ce.expiry_date IS NULL OR ce.expiry_date >= current_date)
  );
