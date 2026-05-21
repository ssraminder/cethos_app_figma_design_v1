-- 2026-05-21 — Phase A affidavit pipeline foundation
--
-- 1. New table `certification_affidavit_templates` — versioned, English-only seed.
-- 2. New columns on `quote_files` for the affidavit pipeline.
-- 3. Seed Phase A row: oath_commissioner / Alberta / english_only.
--
-- Lookup key is `certification_type_code` matching `certification_types.code`
-- (the slug, e.g. `oath_commissioner`) — NOT the human-readable name.
-- Non-English target languages must fail loud — Phase B will add bilingual rows.

CREATE TABLE IF NOT EXISTS public.certification_affidavit_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_type_code TEXT NOT NULL,
  jurisdiction_province TEXT,
  jurisdiction_city TEXT,
  language_mode TEXT NOT NULL DEFAULT 'english_only'
    CHECK (language_mode IN ('english_only', 'bilingual')),
  heading TEXT NOT NULL DEFAULT 'AFFIDAVIT',
  body_template TEXT NOT NULL,
  commissioner_block_template TEXT NOT NULL,
  field_labels JSONB NOT NULL DEFAULT '{
    "dated": "Dated",
    "document_holder": "Name(s) on the document",
    "document_translated": "Document translated"
  }'::jsonb,
  include_translator_block BOOLEAN NOT NULL DEFAULT TRUE,
  include_company_block BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_by_staff_id UUID REFERENCES public.staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active row per (cert code, province-or-any, language mode).
-- COALESCE keeps the NULL-province "any-jurisdiction" rows uniquely indexable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affidavit_template_active
  ON public.certification_affidavit_templates (
    certification_type_code,
    COALESCE(jurisdiction_province, ''),
    language_mode
  )
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_affidavit_template_lookup
  ON public.certification_affidavit_templates (certification_type_code, language_mode)
  WHERE is_active = TRUE;

ALTER TABLE public.certification_affidavit_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affidavit_templates_authenticated_read"
  ON public.certification_affidavit_templates;
CREATE POLICY "affidavit_templates_authenticated_read"
  ON public.certification_affidavit_templates
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "affidavit_templates_service_role_all"
  ON public.certification_affidavit_templates;
CREATE POLICY "affidavit_templates_service_role_all"
  ON public.certification_affidavit_templates
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- Touch updated_at on UPDATE.
CREATE OR REPLACE FUNCTION public.certification_affidavit_templates_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certification_affidavit_templates_touch_trg
  ON public.certification_affidavit_templates;
CREATE TRIGGER certification_affidavit_templates_touch_trg
  BEFORE UPDATE ON public.certification_affidavit_templates
  FOR EACH ROW EXECUTE FUNCTION public.certification_affidavit_templates_touch();

-- 2. Three new columns on quote_files for the affidavit pipeline.
ALTER TABLE public.quote_files
  ADD COLUMN IF NOT EXISTS source_step_delivery_id UUID
    REFERENCES public.step_deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rendered_affidavit_text TEXT,
  ADD COLUMN IF NOT EXISTS document_holder_name TEXT;

COMMENT ON COLUMN public.quote_files.source_step_delivery_id IS
  'For certified output files: the step_deliveries row whose draft was approved and fed the affidavit. NULL for legacy / non-affidavit files.';
COMMENT ON COLUMN public.quote_files.rendered_affidavit_text IS
  'Frozen affidavit body at render time (ISO 17100 reproducibility). NULL for non-affidavit files.';
COMMENT ON COLUMN public.quote_files.document_holder_name IS
  'Person NAMED on the document (e.g. parent on a child''s certificate). May differ from the ordering customer. Used as {{document_holder_name}} in the affidavit.';

-- 3. Seed Phase A: Oath Commissioner / Alberta / English-only.
-- Body + commissioner block are verbatim from Mahinder Kaur reference affidavit.
INSERT INTO public.certification_affidavit_templates (
  certification_type_code,
  jurisdiction_province,
  jurisdiction_city,
  language_mode,
  body_template,
  commissioner_block_template
) VALUES (
  'oath_commissioner',
  'Alberta',
  'Calgary',
  'english_only',
  'I hereby certify that the {{source_language}} to {{target_language}} translation of the above-mentioned document(s), is accurate and true. The translated document and the photocopies of original document are attached to this affidavit.',
  'AFFIRMED before me at the City of {{commissioner_city}} in the Province of {{commissioner_province}} on this {{affidavit_day_ordinal}} day of {{affidavit_month_year}}'
)
ON CONFLICT DO NOTHING;
