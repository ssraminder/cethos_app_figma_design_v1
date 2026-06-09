-- 20260609 — Backfill vendor_language_pairs from legacy vendors.language_pairs jsonb
-- Context: bug_reports/f9e5b95a (Bobby Rawat, 2026-06-09) — "Not able to select vendor Chang".
-- Investigation showed find-matching-vendors filters by the vendor_language_pairs (VLP) table,
-- but 130 of 659 active vendors with populated legacy vendors.language_pairs jsonb had ZERO
-- VLP rows, so they were invisible to the picker even when the language pair matched.
--
-- This backfill copies the legacy jsonb into VLP for the 129 vendors not already hot-fixed
-- (Chang Reid was inserted by hand the same day). Uppercase + trim normalization mirrors the
-- format the picker queries against. "ANY" rows are preserved as-is; v37 of find-matching-vendors
-- (shipped same day) treats source/target='ANY' as wildcards.
--
-- Idempotent via ON CONFLICT — safe to re-run.

INSERT INTO vendor_language_pairs (vendor_id, source_language, target_language, is_active, notes)
SELECT DISTINCT
       v.id AS vendor_id,
       UPPER(TRIM(pair->>'source')) AS source_language,
       UPPER(TRIM(pair->>'target')) AS target_language,
       true AS is_active,
       'Backfill 2026-06-09: from legacy vendors.language_pairs jsonb (bug_reports/f9e5b95a)' AS notes
FROM vendors v
CROSS JOIN LATERAL jsonb_array_elements(v.language_pairs) pair
WHERE v.status = 'active'
  AND v.language_pairs IS NOT NULL
  AND jsonb_array_length(v.language_pairs) > 0
  AND NOT EXISTS (
    SELECT 1 FROM vendor_language_pairs vlp
    WHERE vlp.vendor_id = v.id
      AND vlp.is_active = true
  )
  AND COALESCE(TRIM(pair->>'source'), '') <> ''
  AND COALESCE(TRIM(pair->>'target'), '') <> ''
ON CONFLICT (vendor_id, source_language, target_language) DO UPDATE
  SET is_active = true;
