-- Capture quote intent on public /secure-upload submissions.
-- The marketing form now asks: is this for an EXISTING order/quote, or a NEW
-- quote? For a new quote it collects source language, target language, and
-- intended use (target + use are pure customer intent that OCR can't recover).
-- convert-submission-to-quote stamps these onto the created lead quote so it no
-- longer lands with NULL languages (root cause of ORD-2026-10527 / QT26-10687).

ALTER TABLE public.public_submissions
  ADD COLUMN IF NOT EXISTS submission_type   text NOT NULL DEFAULT 'new_quote',
  ADD COLUMN IF NOT EXISTS source_language_id  uuid REFERENCES public.languages(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_language_id  uuid REFERENCES public.languages(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_language_name text,
  ADD COLUMN IF NOT EXISTS target_language_name text,
  ADD COLUMN IF NOT EXISTS intended_use_id   uuid REFERENCES public.intended_uses(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intended_use_name text;

-- Guard the discriminator to the two known modes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.public_submissions'::regclass
      AND conname = 'public_submissions_submission_type_check'
  ) THEN
    ALTER TABLE public.public_submissions
      ADD CONSTRAINT public_submissions_submission_type_check
      CHECK (submission_type IN ('new_quote', 'existing'));
  END IF;
END$$;

COMMENT ON COLUMN public.public_submissions.submission_type IS
  'new_quote = customer wants a fresh quote (source/target/intended_use captured); existing = upload for an order_or_quote_id they already have.';
