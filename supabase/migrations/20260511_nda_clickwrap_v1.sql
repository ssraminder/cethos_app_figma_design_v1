-- ISO 17100 § 4 — confidentiality records. Versioned NDA templates with
-- clickwrap signing. Audit-defensible: every signature captures the exact
-- template version + signed_at + IP + UA + typed full name.

CREATE TABLE IF NOT EXISTS nda_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'global',
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_md TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by_staff_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nda_templates_active_per_jurisdiction
  ON nda_templates (jurisdiction)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS vendor_nda_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  application_id UUID,
  nda_template_id UUID NOT NULL REFERENCES nda_templates(id) ON DELETE RESTRICT,
  signed_full_name TEXT NOT NULL,
  signed_email TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signer_ip TEXT,
  signer_user_agent TEXT,
  signature_image_path TEXT,
  signed_html_snapshot TEXT NOT NULL,
  signed_pdf_storage_path TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  superseded_by_id UUID REFERENCES vendor_nda_signatures(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ,
  superseded_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (vendor_id IS NOT NULL OR application_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vendor_nda_signatures_vendor
  ON vendor_nda_signatures (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_nda_signatures_application
  ON vendor_nda_signatures (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_nda_signatures_current
  ON vendor_nda_signatures (vendor_id, is_current)
  WHERE is_current = true;

-- Seed-only INSERT happens at apply time via mcp__supabase__apply_migration.
-- This file documents the schema; the default template was inserted live.
