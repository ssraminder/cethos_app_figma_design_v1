-- Rich interactive training content. Each lesson may carry an ordered array of
-- typed content blocks (prose | steps | example | callout | comparison) rendered
-- by a shared block renderer (vendor portal + admin lesson player). NULL falls
-- back to body_markdown, so existing content keeps working with no migration.
-- Part of the vendor-training rework.
ALTER TABLE public.cvp_training_lessons
  ADD COLUMN IF NOT EXISTS content_blocks jsonb;

COMMENT ON COLUMN public.cvp_training_lessons.content_blocks IS
  'Ordered typed content blocks for the interactive renderer; NULL => render body_markdown. Block shape: {type, ...}.';
