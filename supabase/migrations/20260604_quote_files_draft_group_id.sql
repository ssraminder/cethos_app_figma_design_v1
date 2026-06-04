-- Per-document grouping for draft translations.
-- review_version was order-wide, which conflated distinct documents
-- (Birth Certificate, PCC, etc.) as if they were revisions of one logical
-- draft. draft_group_id is a per-(quote, logical document) key so each
-- document gets its own independent v1, v2, v3 chain and the customer
-- portal can show multiple parallel pending drafts.

ALTER TABLE public.quote_files
  ADD COLUMN IF NOT EXISTS draft_group_id UUID;

-- Backfill: every existing draft_translation row in a given quote shares
-- ONE group_id. This preserves the legacy "latest pending version wins"
-- semantics for legacy data — customer portal won't suddenly start
-- showing extra rows from before this feature shipped.
WITH legacy_groups AS (
  SELECT qf.quote_id, gen_random_uuid() AS new_group_id
  FROM public.quote_files qf
  JOIN public.file_categories fc ON fc.id = qf.file_category_id
  WHERE fc.slug = 'draft_translation'
    AND qf.draft_group_id IS NULL
  GROUP BY qf.quote_id
)
UPDATE public.quote_files qf
SET draft_group_id = lg.new_group_id
FROM legacy_groups lg
WHERE qf.quote_id = lg.quote_id
  AND qf.draft_group_id IS NULL
  AND qf.file_category_id IN (SELECT id FROM public.file_categories WHERE slug = 'draft_translation');

CREATE INDEX IF NOT EXISTS quote_files_draft_group_id_idx
  ON public.quote_files (draft_group_id)
  WHERE draft_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quote_files_quote_draft_group_idx
  ON public.quote_files (quote_id, draft_group_id)
  WHERE draft_group_id IS NOT NULL;

COMMENT ON COLUMN public.quote_files.draft_group_id IS
  'Per-document grouping key for draft_translation rows. All rows sharing this UUID are revisions of the same logical document. NULL for non-draft files. Assigned at INSERT — fresh UUID for each NEW document, reused for revisions.';
