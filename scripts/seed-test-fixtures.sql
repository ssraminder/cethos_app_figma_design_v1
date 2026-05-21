-- ============================================================================
-- E2E test fixtures — idempotent.
--
-- Hand-runnable seed for end-to-end workflow tests. Apply via the Supabase
-- SQL editor or:
--   psql "$DATABASE_URL" -f scripts/seed-test-fixtures.sql
--
-- Maintains a fully-activated test vendor that can be assigned to a workflow
-- step and impersonated via admin-impersonate-vendor without hitting the
-- production onboarding gates (CV upload + NDA signature).
--
-- Why this exists: real vendors are correctly gated until they upload a CV
-- and sign the NDA. Seeded test fixtures were skipping those rows, so the
-- vendor portal showed the onboarding wall and "Jobs" was unreachable.
-- Caught during the 2026-05-21 e2e walk against ORD-2026-834732.
--
-- DOES NOT run as a migration — fixtures stay out of the prod migration
-- chain. Re-run any time to repair drift.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST VENDOR — Marie Dubois (marie.dubois.test@cethos.com)
-- FR→EN translator, fully onboarded so admin-impersonate-vendor goes
-- straight to /jobs without the onboarding gate.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_vendor_id UUID := 'b058f7d0-f7bc-4764-b72e-f0ffc0dc3cda';
  v_nda_template UUID;
  v_staff_id UUID;
BEGIN
  -- Activate the vendor + sign NDA at the vendors row level.
  SELECT id INTO v_nda_template
  FROM public.nda_templates
  WHERE is_active = TRUE
  ORDER BY created_at DESC LIMIT 1;

  SELECT id INTO v_staff_id
  FROM public.staff_users
  WHERE email ILIKE 'ss.raminder@gmail.com'
  LIMIT 1;

  UPDATE public.vendors
  SET status = 'active',
      nda_signed_at = COALESCE(nda_signed_at, now()),
      nda_template_id = COALESCE(nda_template_id, v_nda_template)
  WHERE id = v_vendor_id;

  -- FR→EN language pair
  INSERT INTO public.vendor_language_pairs (vendor_id, source_language, target_language, is_active)
  SELECT v_vendor_id, 'fr', 'en', TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vendor_language_pairs
    WHERE vendor_id = v_vendor_id
      AND source_language = 'fr'
      AND target_language = 'en'
  );

  -- Stub CV row so the onboarding card shows "CV on file"
  INSERT INTO public.vendor_cvs (
    vendor_id, version, file_storage_path, file_name, file_size_bytes,
    content_type, uploaded_by_vendor, is_current, notes
  )
  SELECT v_vendor_id, 1, 'test/marie-dubois-stub.pdf', 'marie-dubois-stub.pdf',
         1, 'application/pdf', FALSE, TRUE, 'E2E test stub'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vendor_cvs
    WHERE vendor_id = v_vendor_id AND is_current
  );

  -- NDA signature row (the vendor portal checks vendor_nda_signatures, not
  -- vendors.nda_signed_at)
  INSERT INTO public.vendor_nda_signatures (
    vendor_id, nda_template_id, signed_full_name, signed_email,
    signed_at, is_current, signed_html_snapshot, verification_log
  )
  SELECT v_vendor_id, v_nda_template, 'Marie Dubois',
         'marie.dubois.test@cethos.com', now(), TRUE,
         '<p>E2E test stub</p>', '{"e2e_stub":true}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vendor_nda_signatures
    WHERE vendor_id = v_vendor_id AND is_current
  );

  RAISE NOTICE 'Marie Dubois (test vendor) seeded: id=%, status=active, FR→EN, CV+NDA stub on file',
    v_vendor_id;
END $$;

-- Verify
SELECT v.full_name, v.email, v.status,
  v.nda_signed_at IS NOT NULL AS nda_field_set,
  (SELECT count(*) FROM public.vendor_nda_signatures
    WHERE vendor_id = v.id AND is_current) AS nda_sig_rows,
  (SELECT count(*) FROM public.vendor_cvs
    WHERE vendor_id = v.id AND is_current) AS cv_rows,
  (SELECT count(*) FROM public.vendor_language_pairs
    WHERE vendor_id = v.id) AS lang_pairs
FROM public.vendors v
WHERE v.id = 'b058f7d0-f7bc-4764-b72e-f0ffc0dc3cda';
