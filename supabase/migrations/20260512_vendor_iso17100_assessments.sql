-- vendor_iso17100_assessments
--
-- Backfill migration: the table was created live and used by the
-- `vendor-iso17100-assess` edge function before this migration file
-- was committed. This file mirrors the production schema so fresh
-- environments + branches can reproduce it.
--
-- Each row is one assessment run. We keep history (no upsert) so
-- admins can see how a vendor's verdict changes as evidence is added.
-- corrected_* fields are reserved for the Phase C feedback-loop work:
-- an admin can override the model's verdict, and those corrections
-- will eventually feed back as few-shot examples.

CREATE TABLE IF NOT EXISTS public.vendor_iso17100_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  model text NOT NULL,
  prompt_version text NOT NULL,
  input_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  overall_verdict text,
  created_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Phase C: admin correction overlay.
  corrected_result jsonb,
  corrected_by uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  corrected_at timestamptz,
  correction_notes text,

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_iso17100_assessments_vendor_created_idx
  ON public.vendor_iso17100_assessments (vendor_id, created_at DESC);

COMMENT ON TABLE public.vendor_iso17100_assessments IS
  'LLM-driven ISO 17100:2015 §6.1.2/§6.1.4 vendor competence assessments. Append-only history; corrected_* overlays for Phase C admin overrides.';
