-- ============================================================================
-- EXTENDED LOCKDOWN — closes leaks the emergency migration missed.
--
-- Follow-up to 20260514_emergency_rls_lockdown.sql. After the May 14 audit
-- on the customer-data exposure, a second pass found that several tables
-- created via earlier migrations had policies with `USING (true)` to the
-- authenticated role — meaning any logged-in user (customer OR vendor)
-- could read them — and that the `pdf-documents` storage bucket plus its
-- backing tables had no role restriction at all.
--
-- This migration:
--   1. Replaces the over-broad authenticated policies on companies,
--      order_communications, order_communication_attachments,
--      order_ai_instructions, pdf_folders, pdf_documents, pdf_annotations,
--      pdf_shares, and tightens staff_users.
--   2. Replaces the storage.objects policies on the `pdf-documents`
--      bucket (which were FOR ALL USING (true) with no role check).
--   3. Forces `pdf-documents`, `ocr-uploads`, and `quote-reference-files`
--      buckets private, and adds proper role-scoped policies for
--      ocr-uploads (staff/service only) and quote-reference-files
--      (anon write to `uploads/`, customer SELECT on own quote, staff/
--      service full) — same shape as the quote-files bucket.
--   4. Defensively enables RLS + service_role / staff_all policies on
--      every vendor_* table created outside migrations (`vendors`,
--      `vendor_auth`, `vendor_otp`, `vendor_sessions`,
--      `vendor_language_pairs`, `vendor_rates`, `vendor_payment_info`,
--      `vendor_payables`, `vendor_step_offers`). Guarded with
--      `IF EXISTS` so unknown tables are no-ops.
--
-- All vendor flows in `client/` go through edge functions using the
-- service role, so locking those tables down has no expected app impact.
--
-- BREAKING-CHANGE NOTE: staff_users is tightened from "any authenticated
-- user can read active staff" to "only active staff can read staff_users".
-- A grep of client/ shows every direct .from('staff_users') call lives in
-- admin / staff-auth code paths, so customer/vendor UIs should not break.
-- The is_active_staff() helper itself is SECURITY DEFINER and bypasses
-- RLS, so staff sign-in keeps working.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. companies — drop USING(true) authenticated policies; add scoped ones.
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read companies"      ON public.companies;
DROP POLICY IF EXISTS "Authenticated can insert companies"    ON public.companies;
DROP POLICY IF EXISTS "Authenticated can update companies"    ON public.companies;
DROP POLICY IF EXISTS "Service role full access on companies" ON public.companies;
DROP POLICY IF EXISTS companies_service_role_all              ON public.companies;
DROP POLICY IF EXISTS companies_staff_all                     ON public.companies;
DROP POLICY IF EXISTS companies_customer_select               ON public.companies;

CREATE POLICY companies_service_role_all ON public.companies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY companies_staff_all ON public.companies
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

-- A customer can read only the company their own customer row belongs to.
CREATE POLICY companies_customer_select ON public.companies
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.customers
      WHERE auth_user_id = auth.uid()
        AND company_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 2. order_communications + attachments + ai_instructions — staff only.
--    Customers do not need direct access to internal client-email logs,
--    staff notes, or vendor-facing instructions. The customer-facing
--    messaging path goes through dedicated `conversation_messages` and
--    `send-customer-message` edge function, not this table.
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_communications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_communication_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_ai_instructions            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read order_communications"      ON public.order_communications;
DROP POLICY IF EXISTS "Authenticated insert order_communications"    ON public.order_communications;
DROP POLICY IF EXISTS "Service role full access on order_communications" ON public.order_communications;
DROP POLICY IF EXISTS order_communications_service_role_all          ON public.order_communications;
DROP POLICY IF EXISTS order_communications_staff_all                 ON public.order_communications;

CREATE POLICY order_communications_service_role_all ON public.order_communications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY order_communications_staff_all ON public.order_communications
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated read order_comm_attachments"        ON public.order_communication_attachments;
DROP POLICY IF EXISTS "Authenticated insert order_comm_attachments"      ON public.order_communication_attachments;
DROP POLICY IF EXISTS "Service role full access on order_comm_attachments" ON public.order_communication_attachments;
DROP POLICY IF EXISTS order_communication_attachments_service_role_all   ON public.order_communication_attachments;
DROP POLICY IF EXISTS order_communication_attachments_staff_all          ON public.order_communication_attachments;

CREATE POLICY order_communication_attachments_service_role_all ON public.order_communication_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY order_communication_attachments_staff_all ON public.order_communication_attachments
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated read order_ai_instructions"        ON public.order_ai_instructions;
DROP POLICY IF EXISTS "Authenticated update order_ai_instructions"      ON public.order_ai_instructions;
DROP POLICY IF EXISTS "Service role full access on order_ai_instructions" ON public.order_ai_instructions;
DROP POLICY IF EXISTS order_ai_instructions_service_role_all            ON public.order_ai_instructions;
DROP POLICY IF EXISTS order_ai_instructions_staff_all                   ON public.order_ai_instructions;

CREATE POLICY order_ai_instructions_service_role_all ON public.order_ai_instructions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY order_ai_instructions_staff_all ON public.order_ai_instructions
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

-- ---------------------------------------------------------------------------
-- 3. pdf_folders / pdf_documents / pdf_annotations / pdf_shares — staff only.
--    Existing policies were `FOR ALL USING (true)` with no TO clause,
--    which defaults to PUBLIC (= anon + authenticated). Drop and replace.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdf_folders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_shares      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage pdf_folders"     ON public.pdf_folders;
DROP POLICY IF EXISTS "Staff can manage pdf_documents"   ON public.pdf_documents;
DROP POLICY IF EXISTS "Staff can manage pdf_annotations" ON public.pdf_annotations;
DROP POLICY IF EXISTS "Staff can manage pdf_shares"      ON public.pdf_shares;
DROP POLICY IF EXISTS pdf_folders_service_role_all       ON public.pdf_folders;
DROP POLICY IF EXISTS pdf_folders_staff_all              ON public.pdf_folders;
DROP POLICY IF EXISTS pdf_documents_service_role_all     ON public.pdf_documents;
DROP POLICY IF EXISTS pdf_documents_staff_all            ON public.pdf_documents;
DROP POLICY IF EXISTS pdf_annotations_service_role_all   ON public.pdf_annotations;
DROP POLICY IF EXISTS pdf_annotations_staff_all          ON public.pdf_annotations;
DROP POLICY IF EXISTS pdf_shares_service_role_all        ON public.pdf_shares;
DROP POLICY IF EXISTS pdf_shares_staff_all               ON public.pdf_shares;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pdf_folders', 'pdf_documents', 'pdf_annotations', 'pdf_shares'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      t, t);
    EXECUTE format(
      'CREATE POLICY %I_staff_all ON public.%I FOR ALL TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());',
      t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. staff_users — tighten read to active staff only.
--    Previous policy let any authenticated user (customers and vendors
--    included) enumerate the entire staff roster. Customer-facing UIs in
--    this repo never read staff_users directly; admin pages do, and the
--    is_active_staff() helper is SECURITY DEFINER so sign-in itself is
--    unaffected.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can read active staff"     ON public.staff_users;
DROP POLICY IF EXISTS "Service role full access on staff_users" ON public.staff_users;
DROP POLICY IF EXISTS staff_users_service_role_all              ON public.staff_users;
DROP POLICY IF EXISTS staff_users_staff_all                     ON public.staff_users;

CREATE POLICY staff_users_service_role_all ON public.staff_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY staff_users_staff_all ON public.staff_users
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

-- ---------------------------------------------------------------------------
-- 5. Vendor tables — created outside migrations. Lock down defensively
--    behind IF EXISTS so this is a no-op if a table doesn't live in this
--    project. All vendor flows route through edge functions with the
--    service role, so the staff_all + service_role_all pair is sufficient.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendors',
    'vendor_auth',
    'vendor_otp',
    'vendor_sessions',
    'vendor_language_pairs',
    'vendor_rates',
    'vendor_payment_info',
    'vendor_payables',
    'vendor_step_offers'
  ]) LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_service_role_all ON public.%I;', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_staff_all        ON public.%I;', t, t);
      EXECUTE format(
        'CREATE POLICY %I_service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
        t, t);
      EXECUTE format(
        'CREATE POLICY %I_staff_all ON public.%I FOR ALL TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());',
        t, t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. pdf-documents storage bucket: force private + drop the wide-open
--    storage.objects policies and replace with role-scoped versions.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-documents', 'pdf-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Staff can upload pdf documents"   ON storage.objects;
DROP POLICY IF EXISTS "Staff can read pdf documents"     ON storage.objects;
DROP POLICY IF EXISTS "Staff can update pdf documents"   ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete pdf documents"   ON storage.objects;
DROP POLICY IF EXISTS pdf_documents_service_role_all_obj ON storage.objects;
DROP POLICY IF EXISTS pdf_documents_staff_all_obj        ON storage.objects;

CREATE POLICY pdf_documents_service_role_all_obj ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'pdf-documents')
  WITH CHECK (bucket_id = 'pdf-documents');

CREATE POLICY pdf_documents_staff_all_obj ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'pdf-documents' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'pdf-documents' AND public.is_active_staff());

-- ---------------------------------------------------------------------------
-- 7. ocr-uploads storage bucket: dashboard-created, status unknown. Force
--    private and add staff/service-only policies. Customer-facing code in
--    this repo never reads from ocr-uploads — it's chunk storage for
--    server-side OCR — so no customer/anon policy.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('ocr-uploads', 'ocr-uploads', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS ocr_uploads_service_role_all ON storage.objects;
DROP POLICY IF EXISTS ocr_uploads_staff_all        ON storage.objects;

CREATE POLICY ocr_uploads_service_role_all ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'ocr-uploads')
  WITH CHECK (bucket_id = 'ocr-uploads');

CREATE POLICY ocr_uploads_staff_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'ocr-uploads' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'ocr-uploads' AND public.is_active_staff());

-- ---------------------------------------------------------------------------
-- 8. quote-reference-files bucket: dashboard-created, used by anon Step1
--    upload of reference materials. Mirror the quote-files policy shape.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-reference-files', 'quote-reference-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS quote_reference_files_anon_insert_uploads  ON storage.objects;
DROP POLICY IF EXISTS quote_reference_files_anon_delete_uploads  ON storage.objects;
DROP POLICY IF EXISTS quote_reference_files_customer_select      ON storage.objects;
DROP POLICY IF EXISTS quote_reference_files_staff_all            ON storage.objects;
DROP POLICY IF EXISTS quote_reference_files_service_role_all     ON storage.objects;

CREATE POLICY quote_reference_files_anon_insert_uploads
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'quote-reference-files'
    AND (storage.foldername(name))[1] = 'uploads'
  );

CREATE POLICY quote_reference_files_anon_delete_uploads
  ON storage.objects FOR DELETE TO anon
  USING (
    bucket_id = 'quote-reference-files'
    AND (storage.foldername(name))[1] = 'uploads'
  );

CREATE POLICY quote_reference_files_customer_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-reference-files'
    AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id::text = (storage.foldername(name))[1]
        AND q.customer_id = public.current_customer_id()
    )
  );

CREATE POLICY quote_reference_files_staff_all
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'quote-reference-files' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'quote-reference-files' AND public.is_active_staff());

CREATE POLICY quote_reference_files_service_role_all
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'quote-reference-files')
  WITH CHECK (bucket_id = 'quote-reference-files');

-- ---------------------------------------------------------------------------
-- 9. Verification — print which tables now have RLS on, and which
--    buckets are private. Informational, safe to leave in.
-- ---------------------------------------------------------------------------

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies', 'order_communications', 'order_communication_attachments',
    'order_ai_instructions', 'pdf_folders', 'pdf_documents',
    'pdf_annotations', 'pdf_shares', 'staff_users',
    'vendors', 'vendor_auth', 'vendor_otp', 'vendor_sessions',
    'vendor_language_pairs', 'vendor_rates', 'vendor_payment_info',
    'vendor_payables', 'vendor_step_offers'
  )
ORDER BY tablename;

SELECT id, public FROM storage.buckets
WHERE id IN ('pdf-documents', 'ocr-uploads', 'quote-reference-files',
             'quote-files', 'invoices')
ORDER BY id;

COMMIT;
