-- ============================================================================
-- vendor_document_requests — admin-initiated ISO 17100 evidence request to
-- an already-onboarded vendor. Parallel to cvp-request-documents (which
-- targets recruitment-stage applicants).
--
-- Lifecycle:
--   draft       — auto-created by the ISO assessment (Phase 3); not sent
--   sent        — email out, awaiting vendor action
--   partial     — vendor has uploaded/filled some but not all items
--   completed   — all requested items satisfied
--   expired     — past request_token_expires_at without completion
--   superseded  — newer request was opened for the same vendor
--
-- requested_items is the structured checklist. Each item is one of:
--   { kind: 'file',  slug: '<iso doc type>',  label, completed_at? }
--   { kind: 'profile_field', slug: '<vendors column>', label, completed_at? }
-- The vendor portal flips completed_at to now() as the vendor satisfies
-- each item; when every item is satisfied, status flips to 'completed'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendor_document_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                 uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  request_token             uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  request_token_expires_at  timestamptz NOT NULL,
  staff_id                  uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  staff_message             text,
  ai_drafted_message        text,
  subject                   text,
  body_html                 text,
  requested_items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_assessment_id      uuid REFERENCES public.vendor_iso17100_assessments(id) ON DELETE SET NULL,
  status                    text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft','sent','partial','completed','expired','superseded')),
  completed_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vendor_document_requests IS
  'Admin-initiated ISO 17100 evidence ask for an already-onboarded vendor. Parallel to cvp_application_reference_requests / vendor_reference_requests but for document + profile-field collection.';

CREATE INDEX IF NOT EXISTS idx_vendor_document_requests_vendor
  ON public.vendor_document_requests (vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_document_requests_open
  ON public.vendor_document_requests (vendor_id)
  WHERE status IN ('draft','sent','partial');

-- updated_at trigger reuses the canonical helper if present, else creates one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE FUNCTION public.set_updated_at() RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_vendor_document_requests_updated_at ON public.vendor_document_requests;
CREATE TRIGGER trg_vendor_document_requests_updated_at
  BEFORE UPDATE ON public.vendor_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- When a fresh request is inserted with status='sent', auto-supersede any
-- prior open requests for the same vendor. One active request per vendor.
CREATE OR REPLACE FUNCTION public.supersede_prior_vendor_document_requests()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('sent','partial') THEN
    UPDATE public.vendor_document_requests
       SET status = 'superseded'
     WHERE vendor_id = NEW.vendor_id
       AND id <> NEW.id
       AND status IN ('draft','sent','partial');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendor_document_requests_supersede ON public.vendor_document_requests;
CREATE TRIGGER trg_vendor_document_requests_supersede
  AFTER INSERT ON public.vendor_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.supersede_prior_vendor_document_requests();
