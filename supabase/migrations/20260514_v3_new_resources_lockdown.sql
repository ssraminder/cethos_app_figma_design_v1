-- ============================================================================
-- V3 LOCKDOWN — new tables and buckets introduced on `main` while the
-- emergency lockdown PR was being prepared.
--
-- Follow-up to:
--   20260514_emergency_rls_lockdown.sql
--   20260514_v2_extended_lockdown.sql
--
-- This migration brings the same four-tier model to every sensitive
-- resource added between 2026-04-24 and 2026-05-14 that wasn't in the
-- first two passes. The four tiers are:
--
--   1. service_role — full access (edge functions).
--   2. staff (active staff_users row, via public.is_active_staff()) — full.
--   3. authenticated customer — SELECT only on rows they own, via
--      public.current_customer_id().
--   4. anon — no access.
--
-- Tables locked down:
--   public.customer_files               (CUSTOMER_SCOPED)
--   public.public_submissions           (STAFF_ONLY; nullable customer link
--                                        is for audit, not customer UI)
--   public.secure_upload_otps           (STAFF_ONLY; service-role primarily)
--   public.internal_projects            (STAFF_ONLY; drops USING(true)
--                                        authenticated leaks)
--   public.company_project_managers     (STAFF_ONLY; drops anon USING(true))
--   public.order_receivables            (CUSTOMER_SCOPED; drops anon
--                                        USING(true) for all DML)
--   public.nda_templates                (STAFF_ONLY)
--   public.vendor_nda_signatures        (STAFF_ONLY)
--   public.negotiation_settings         (STAFF_ONLY)
--   public.vendor_negotiation_decisions (STAFF_ONLY)
--   public.vendor_rate_suggestions      (STAFF_ONLY)
--   public.vendor_iso17100_assessments  (STAFF_ONLY)
--   public.vendor_document_requests     (STAFF_ONLY)
--   public.vendor_activation_email_schedule (STAFF_ONLY)
--
-- Storage buckets forced private + role-scoped:
--   customer-files               (CUSTOMER_SCOPED on own customerId prefix)
--   public-submissions           (STAFF_ONLY)
--   public-submissions-quarantine (STAFF_ONLY)
--   pdf-to-word                  (STAFF_ONLY)
--   project-assets               (STAFF_ONLY)
--
-- Notes:
--   - Every ALTER TABLE is `IF EXISTS`-guarded via a DO block so the
--     migration is a no-op for any table that hasn't shipped yet.
--   - Every CREATE POLICY is preceded by DROP POLICY IF EXISTS with the
--     same name. Idempotent — running twice is a no-op.
--   - `is_active_staff()` and `current_customer_id()` come from
--     20260514_emergency_rls_lockdown.sql. This migration assumes that
--     migration has run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: enable RLS + service_role_all + staff_all on a table if it exists.
-- Used for the bulk of new tables that follow the STAFF_ONLY pattern.
-- ---------------------------------------------------------------------------

-- Explicit ALTER TABLE statements so the migration-RLS linter can confirm
-- each table is enabled. `IF EXISTS` makes them no-ops if the underlying
-- migration that creates the table hasn't shipped yet on this environment.
ALTER TABLE IF EXISTS public.customer_files                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.public_submissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.secure_upload_otps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.internal_projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_project_managers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_receivables               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.nda_templates                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_nda_signatures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.negotiation_settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_negotiation_decisions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_rate_suggestions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_iso17100_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_document_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendor_activation_email_schedule ENABLE ROW LEVEL SECURITY;

DO $bootstrap$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customer_files',
    'public_submissions',
    'secure_upload_otps',
    'internal_projects',
    'company_project_managers',
    'order_receivables',
    'nda_templates',
    'vendor_nda_signatures',
    'negotiation_settings',
    'vendor_negotiation_decisions',
    'vendor_rate_suggestions',
    'vendor_iso17100_assessments',
    'vendor_document_requests',
    'vendor_activation_email_schedule'
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
END
$bootstrap$;

-- ---------------------------------------------------------------------------
-- 1. customer_files — drop the legacy `is_staff_user()` policies (created
--    in 20260424_staff_rls_for_uploads.sql) and add a CUSTOMER_SCOPED
--    SELECT so customers can see their own files via the portal.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='customer_files') THEN
    -- Drop the wider `is_staff_user()` policies; the helper above already
    -- installed staff_all + service_role_all using the canonical predicate.
    DROP POLICY IF EXISTS "Staff can read customer_files"   ON public.customer_files;
    DROP POLICY IF EXISTS "Staff can update customer_files" ON public.customer_files;

    DROP POLICY IF EXISTS customer_files_customer_select ON public.customer_files;
    CREATE POLICY customer_files_customer_select ON public.customer_files
      FOR SELECT TO authenticated
      USING (customer_id = public.current_customer_id());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. public_submissions — drop the legacy `is_staff_user()` policies.
--    Customer link is nullable + audit-only; no customer SELECT policy.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='public_submissions') THEN
    DROP POLICY IF EXISTS "Staff can read public_submissions"   ON public.public_submissions;
    DROP POLICY IF EXISTS "Staff can update public_submissions" ON public.public_submissions;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. internal_projects — drop the over-broad authenticated USING(true)
--    policies installed in 20260505_internal_projects.sql.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='internal_projects') THEN
    DROP POLICY IF EXISTS "Authenticated can read internal_projects"   ON public.internal_projects;
    DROP POLICY IF EXISTS "Authenticated can insert internal_projects" ON public.internal_projects;
    DROP POLICY IF EXISTS "Authenticated can update internal_projects" ON public.internal_projects;
    DROP POLICY IF EXISTS "Service role full access on internal_projects" ON public.internal_projects;

    -- Optional CUSTOMER_SCOPED SELECT: uncomment if the customer portal
    -- needs to list project numbers attached to the customer.
    -- DROP POLICY IF EXISTS internal_projects_customer_select ON public.internal_projects;
    -- CREATE POLICY internal_projects_customer_select ON public.internal_projects
    --   FOR SELECT TO authenticated
    --   USING (customer_id = public.current_customer_id());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. company_project_managers — drop the anon USING(true) policies installed
--    in 20260508_company_project_managers.sql. Staff-only via helper above.
--
--    NOTE: if a customer-portal UI ever lists company PMs, add a
--    CUSTOMER_SCOPED SELECT keyed to the caller's own company_id.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='company_project_managers') THEN
    DROP POLICY IF EXISTS "Service role full access" ON public.company_project_managers;
    DROP POLICY IF EXISTS "Anon read for staff portal"   ON public.company_project_managers;
    DROP POLICY IF EXISTS "Anon insert for staff portal" ON public.company_project_managers;
    DROP POLICY IF EXISTS "Anon update for staff portal" ON public.company_project_managers;

    -- Optional CUSTOMER_SCOPED SELECT:
    -- DROP POLICY IF EXISTS company_project_managers_customer_select ON public.company_project_managers;
    -- CREATE POLICY company_project_managers_customer_select ON public.company_project_managers
    --   FOR SELECT TO authenticated
    --   USING (
    --     company_id IN (
    --       SELECT company_id FROM public.customers
    --       WHERE auth_user_id = auth.uid()
    --         AND company_id IS NOT NULL
    --     )
    --   );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. order_receivables — drop the anon USING(true) DML policies installed
--    in 20260508_order_receivables_table.sql. Add a CUSTOMER_SCOPED SELECT
--    so customers can see their own order's billing lines.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='order_receivables') THEN
    DROP POLICY IF EXISTS "Service role full access"     ON public.order_receivables;
    DROP POLICY IF EXISTS "Anon read for staff portal"   ON public.order_receivables;
    DROP POLICY IF EXISTS "Anon insert for staff portal" ON public.order_receivables;
    DROP POLICY IF EXISTS "Anon update for staff portal" ON public.order_receivables;
    DROP POLICY IF EXISTS "Anon delete for staff portal" ON public.order_receivables;

    DROP POLICY IF EXISTS order_receivables_customer_select ON public.order_receivables;
    CREATE POLICY order_receivables_customer_select ON public.order_receivables
      FOR SELECT TO authenticated
      USING (
        order_id IN (
          SELECT id FROM public.orders
          WHERE customer_id = public.current_customer_id()
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. nda_templates — staff_only via helper above. If the vendor clickwrap
--    signing page is anonymous, uncomment the anon SELECT below scoped to
--    the active template only.
-- ---------------------------------------------------------------------------

-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='nda_templates') THEN
--     DROP POLICY IF EXISTS nda_templates_anon_select_active ON public.nda_templates;
--     CREATE POLICY nda_templates_anon_select_active ON public.nda_templates
--       FOR SELECT TO anon
--       USING (is_active = true);
--   END IF;
-- END $$;

-- ---------------------------------------------------------------------------
-- 7. customer-files storage bucket — force private + replace the legacy
--    `is_staff_user()` storage.objects policies with the canonical
--    is_active_staff() ones, and add a customer SELECT scoped to the
--    caller's own customer_id prefix (path: `<customerId>/...`).
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-files', 'customer-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Service role manages customer-files"     ON storage.objects;
DROP POLICY IF EXISTS "Staff can read customer-files objects"   ON storage.objects;
DROP POLICY IF EXISTS "Staff can write customer-files objects"  ON storage.objects;
DROP POLICY IF EXISTS "Staff can update customer-files objects" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete customer-files objects" ON storage.objects;
DROP POLICY IF EXISTS customer_files_service_role_all_obj      ON storage.objects;
DROP POLICY IF EXISTS customer_files_staff_all_obj             ON storage.objects;
DROP POLICY IF EXISTS customer_files_customer_select_obj       ON storage.objects;

CREATE POLICY customer_files_service_role_all_obj ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'customer-files')
  WITH CHECK (bucket_id = 'customer-files');

CREATE POLICY customer_files_staff_all_obj ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'customer-files' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'customer-files' AND public.is_active_staff());

CREATE POLICY customer_files_customer_select_obj ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-files'
    AND (storage.foldername(name))[1] = public.current_customer_id()::text
  );

-- ---------------------------------------------------------------------------
-- 8. public-submissions + public-submissions-quarantine storage buckets —
--    force private + replace the staff `is_staff_user()` policy with the
--    canonical is_active_staff() one. No anon read (intake goes through
--    service-role signed upload URLs).
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('public-submissions', 'public-submissions', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('public-submissions-quarantine', 'public-submissions-quarantine', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Service role manages public-submissions"    ON storage.objects;
DROP POLICY IF EXISTS "Staff can read public-submissions objects"  ON storage.objects;
DROP POLICY IF EXISTS public_submissions_service_role_all_obj      ON storage.objects;
DROP POLICY IF EXISTS public_submissions_staff_all_obj             ON storage.objects;

CREATE POLICY public_submissions_service_role_all_obj ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id IN ('public-submissions','public-submissions-quarantine'))
  WITH CHECK (bucket_id IN ('public-submissions','public-submissions-quarantine'));

CREATE POLICY public_submissions_staff_all_obj ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('public-submissions','public-submissions-quarantine')
    AND public.is_active_staff()
  )
  WITH CHECK (
    bucket_id IN ('public-submissions','public-submissions-quarantine')
    AND public.is_active_staff()
  );

-- ---------------------------------------------------------------------------
-- 9. pdf-to-word storage bucket — force private + drop the wide-open
--    policies (FOR INSERT/SELECT/UPDATE/DELETE WITH CHECK (bucket_id=...) ,
--    no role check, defaults to PUBLIC). Staff and service_role only.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-to-word', 'pdf-to-word', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Staff can upload pdf-to-word" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read pdf-to-word"   ON storage.objects;
DROP POLICY IF EXISTS "Staff can update pdf-to-word" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete pdf-to-word" ON storage.objects;
DROP POLICY IF EXISTS pdf_to_word_service_role_all_obj ON storage.objects;
DROP POLICY IF EXISTS pdf_to_word_staff_all_obj        ON storage.objects;

CREATE POLICY pdf_to_word_service_role_all_obj ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'pdf-to-word')
  WITH CHECK (bucket_id = 'pdf-to-word');

CREATE POLICY pdf_to_word_staff_all_obj ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'pdf-to-word' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'pdf-to-word' AND public.is_active_staff());

-- ---------------------------------------------------------------------------
-- 10. project-assets storage bucket — force private + drop the over-broad
--     authenticated SELECT/INSERT/UPDATE/DELETE policies. Staff-only.
--     Vendors get signed URLs via service-role edge function.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-assets', 'project-assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Authenticated can read project-assets"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can insert project-assets"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update project-assets"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete project-assets"   ON storage.objects;
DROP POLICY IF EXISTS "Service role full access on project-assets" ON storage.objects;
DROP POLICY IF EXISTS project_assets_service_role_all_obj          ON storage.objects;
DROP POLICY IF EXISTS project_assets_staff_all_obj                 ON storage.objects;

CREATE POLICY project_assets_service_role_all_obj ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'project-assets')
  WITH CHECK (bucket_id = 'project-assets');

CREATE POLICY project_assets_staff_all_obj ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'project-assets' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'project-assets' AND public.is_active_staff());

-- ---------------------------------------------------------------------------
-- 11. Verification — informational queries.
-- ---------------------------------------------------------------------------

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'customer_files', 'public_submissions', 'secure_upload_otps',
    'internal_projects', 'company_project_managers', 'order_receivables',
    'nda_templates', 'vendor_nda_signatures', 'negotiation_settings',
    'vendor_negotiation_decisions', 'vendor_rate_suggestions',
    'vendor_iso17100_assessments', 'vendor_document_requests',
    'vendor_activation_email_schedule'
  )
ORDER BY tablename;

SELECT id, public FROM storage.buckets
WHERE id IN (
  'customer-files', 'public-submissions', 'public-submissions-quarantine',
  'pdf-to-word', 'project-assets'
)
ORDER BY id;

COMMIT;
