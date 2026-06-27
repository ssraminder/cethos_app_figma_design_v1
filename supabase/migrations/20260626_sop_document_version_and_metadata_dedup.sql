-- SOP version/date single-source-of-truth.
--
-- Problem: each SOP stated its version, status and effective date TWICE — once
-- in the authoritative DB columns (status, effective_date) and once as hand-typed
-- prose inside content_md. The prose copy was never kept in sync and, once a
-- version was approved, froze (trg_sop_versions_immutable) with stale values.
-- e.g. SOP-008 was rendered "Active · v1.0 (2026-06-24)" while the DB held v3
-- effective 2026-06-26.
--
-- Fix:
--   1. Add an explicit, audit-facing `document_version` (e.g. "5.0"). This — not
--      the internal `version_number` counter — is what humans/auditors see. The
--      counter stays as the version-history ordering key.
--   2. Stop the body from restating version/status/effective-date. The detail
--      banner and the export header render those from the DB, so the body no
--      longer carries a copy that can drift.

ALTER TABLE public.sop_versions ADD COLUMN IF NOT EXISTS document_version text;

-- 1) Backfill document_version for EVERY version. The controlled version is the
--    greater of (a) the version the body states for itself and (b) the number of
--    real revisions (version_number): formal SOPs revised before they entered the
--    portal carry a higher body version (SOP-003 = 5.0, only 2 portal versions),
--    while workflow SOPs were authored once at "1.0" yet have several real
--    revisions (SOP-008 has 3 distinct bodies → 3.0).
UPDATE public.sop_versions v
SET document_version =
  greatest(
    coalesce((regexp_match(v.content_md, '\|\s*Version\s*\|\s*(\d+)\.'))[1]::int, 0),
    coalesce((regexp_match(v.content_md, 'Active[^\n]*v(\d+)\.'))[1]::int, 0),
    v.version_number
  )::text || '.0'
WHERE v.document_version IS NULL;

-- 2) Remove the volatile metadata rows from the CURRENT version of each SOP.
--    Only the bolded "**Status**" row (workflow format) and the 2-column
--    "| Version | … |" / "| Effective Date | … |" rows (formal format) are
--    removed. The 4-column revision-history header (| Version | Date | Author |
--    Change |) and the status glossary ("| Superseded | The status of … |") are
--    left untouched — verified by dry-run before applying.
--    Approved versions are frozen by trg_sop_versions_immutable, so it is briefly
--    disabled for this controlled metadata correction (content is otherwise
--    unchanged).
ALTER TABLE public.sop_versions DISABLE TRIGGER trg_sop_versions_immutable;

UPDATE public.sop_versions v
SET content_md =
  regexp_replace(
    regexp_replace(
      regexp_replace(v.content_md,
        '^\|\s*\*\*Status\*\*\s*\|[^\n]*\n', '', 'gn'),
      '^\|\s*Version\s*\|\s*[^|\n]*\|[ \t]*\r?\n', '', 'gn'),
    '^\|\s*Effective Date\s*\|\s*[^|\n]*\|[ \t]*\r?\n', '', 'gn')
FROM public.sops s
WHERE s.current_version_id = v.id;

ALTER TABLE public.sop_versions ENABLE TRIGGER trg_sop_versions_immutable;
