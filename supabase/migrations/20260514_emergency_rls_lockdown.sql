-- ============================================================================
-- EMERGENCY RLS LOCKDOWN
-- ============================================================================
-- Context: external security report confirmed the anon key could read PII from
-- customers, quotes, orders, quote_files, ai_analysis_results, quote_pages,
-- customer_payments, customer_invoices, refunds, and could list/download
-- objects from the `quote-files` storage bucket (birth certificates, driver's
-- licenses, passports).
--
-- This migration:
--   1. Enables RLS on every sensitive public.* table.
--   2. Replaces any existing policies with a consistent four-tier model:
--        - service_role: full access (edge functions).
--        - staff (active row in staff_users via auth_user_id): full access.
--        - authenticated customers: SELECT only, scoped to their own rows.
--        - anon: NO access to any sensitive table.
--   3. Locks the `quote-files` bucket to `public = false` and adds storage
--      policies that:
--        - keep anonymous quote intake working (write-only INSERT/DELETE on
--          the `uploads/` prefix used by client/components/quote/Step1Upload.tsx),
--        - block anon SELECT/LIST entirely (this was the leak),
--        - allow authenticated customers to read files only under quote ids
--          they own,
--        - allow staff full access,
--        - allow service_role full access.
--
-- Policy guard: the canonical staff predicate is the one documented at
-- cethos-database-schema-reference.md:1211, NOT the one in 20260214 which
-- references staff_users.id incorrectly.
--
-- This migration is idempotent. Every CREATE POLICY is preceded by DROP
-- POLICY IF EXISTS with the same name. Running it twice is a no-op.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper predicates (SECURITY DEFINER so they can read from staff_users /
--    customers even when the caller's own JWT cannot).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_users
    WHERE auth_user_id = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.customers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_customer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_customer_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Enable RLS everywhere sensitive. Idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Reset and apply policies, one table at a time.
--
--    Convention for every table:
--      <table>_service_role_all   -- service_role: ALL
--      <table>_staff_all          -- staff (active): ALL
--      <table>_customer_select    -- authenticated customer: SELECT own rows
--
--    Anon gets nothing.
-- ---------------------------------------------------------------------------

-- customers ----------------------------------------------------------------
DROP POLICY IF EXISTS customers_service_role_all ON public.customers;
DROP POLICY IF EXISTS customers_staff_all        ON public.customers;
DROP POLICY IF EXISTS customers_customer_select  ON public.customers;
DROP POLICY IF EXISTS customers_customer_update  ON public.customers;

CREATE POLICY customers_service_role_all ON public.customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY customers_staff_all ON public.customers
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY customers_customer_select ON public.customers
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY customers_customer_update ON public.customers
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- quotes -------------------------------------------------------------------
DROP POLICY IF EXISTS quotes_service_role_all ON public.quotes;
DROP POLICY IF EXISTS quotes_staff_all        ON public.quotes;
DROP POLICY IF EXISTS quotes_customer_select  ON public.quotes;

CREATE POLICY quotes_service_role_all ON public.quotes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY quotes_staff_all ON public.quotes
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY quotes_customer_select ON public.quotes
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id());

-- orders -------------------------------------------------------------------
DROP POLICY IF EXISTS orders_service_role_all ON public.orders;
DROP POLICY IF EXISTS orders_staff_all        ON public.orders;
DROP POLICY IF EXISTS orders_customer_select  ON public.orders;

CREATE POLICY orders_service_role_all ON public.orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY orders_staff_all ON public.orders
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY orders_customer_select ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id());

-- quote_files --------------------------------------------------------------
DROP POLICY IF EXISTS quote_files_service_role_all ON public.quote_files;
DROP POLICY IF EXISTS quote_files_staff_all        ON public.quote_files;
DROP POLICY IF EXISTS quote_files_customer_select  ON public.quote_files;

CREATE POLICY quote_files_service_role_all ON public.quote_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY quote_files_staff_all ON public.quote_files
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY quote_files_customer_select ON public.quote_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_files.quote_id
        AND q.customer_id = public.current_customer_id()
    )
  );

-- quote_pages --------------------------------------------------------------
DROP POLICY IF EXISTS quote_pages_service_role_all ON public.quote_pages;
DROP POLICY IF EXISTS quote_pages_staff_all        ON public.quote_pages;
DROP POLICY IF EXISTS quote_pages_customer_select  ON public.quote_pages;

CREATE POLICY quote_pages_service_role_all ON public.quote_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY quote_pages_staff_all ON public.quote_pages
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY quote_pages_customer_select ON public.quote_pages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quote_files qf
      JOIN public.quotes q ON q.id = qf.quote_id
      WHERE qf.id = quote_pages.quote_file_id
        AND q.customer_id = public.current_customer_id()
    )
  );

-- ai_analysis_results ------------------------------------------------------
-- Contains extracted PII (holder name, DOB, document number). Customer-facing
-- pages should never read this directly; only staff and edge functions need
-- it. We intentionally omit a customer policy.
DROP POLICY IF EXISTS ai_analysis_results_service_role_all ON public.ai_analysis_results;
DROP POLICY IF EXISTS ai_analysis_results_staff_all        ON public.ai_analysis_results;
DROP POLICY IF EXISTS ai_analysis_results_customer_select  ON public.ai_analysis_results;

CREATE POLICY ai_analysis_results_service_role_all ON public.ai_analysis_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ai_analysis_results_staff_all ON public.ai_analysis_results
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

-- customer_payments --------------------------------------------------------
DROP POLICY IF EXISTS customer_payments_service_role_all ON public.customer_payments;
DROP POLICY IF EXISTS customer_payments_staff_all        ON public.customer_payments;
DROP POLICY IF EXISTS customer_payments_customer_select  ON public.customer_payments;

CREATE POLICY customer_payments_service_role_all ON public.customer_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY customer_payments_staff_all ON public.customer_payments
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY customer_payments_customer_select ON public.customer_payments
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id());

-- customer_invoices --------------------------------------------------------
-- Existing migration (20260215) granted authenticated users storage-level
-- read of every invoice — we tighten both the table and (below) the
-- storage.objects policy.
DROP POLICY IF EXISTS customer_invoices_service_role_all       ON public.customer_invoices;
DROP POLICY IF EXISTS customer_invoices_staff_all              ON public.customer_invoices;
DROP POLICY IF EXISTS customer_invoices_customer_select        ON public.customer_invoices;
DROP POLICY IF EXISTS "Service role full access on customer_invoices" ON public.customer_invoices;

CREATE POLICY customer_invoices_service_role_all ON public.customer_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY customer_invoices_staff_all ON public.customer_invoices
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY customer_invoices_customer_select ON public.customer_invoices
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id());

-- refunds ------------------------------------------------------------------
DROP POLICY IF EXISTS refunds_service_role_all ON public.refunds;
DROP POLICY IF EXISTS refunds_staff_all        ON public.refunds;
DROP POLICY IF EXISTS refunds_customer_select  ON public.refunds;

CREATE POLICY refunds_service_role_all ON public.refunds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY refunds_staff_all ON public.refunds
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY refunds_customer_select ON public.refunds
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id());

-- ---------------------------------------------------------------------------
-- 3. Storage: lock the `quote-files` bucket.
--
--    Path conventions in this repo:
--      uploads/<timestamp>-<random>.<ext>       -- anon intake, pre-quote
--      <quote_id>/<timestamp>_<filename>        -- post-quote (staff/edge)
-- ---------------------------------------------------------------------------

-- Force the bucket private. If it doesn't exist yet, create it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-files', 'quote-files', false)
ON CONFLICT (id) DO UPDATE
  SET public = false;

-- Reset previous policies (defensive, names may have varied).
DROP POLICY IF EXISTS "quote_files_anon_insert_uploads"  ON storage.objects;
DROP POLICY IF EXISTS "quote_files_anon_delete_uploads"  ON storage.objects;
DROP POLICY IF EXISTS "quote_files_customer_select"      ON storage.objects;
DROP POLICY IF EXISTS "quote_files_staff_all"            ON storage.objects;
DROP POLICY IF EXISTS "quote_files_service_role_all"     ON storage.objects;
DROP POLICY IF EXISTS "Public read quote files"          ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read quote files"      ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read quote files" ON storage.objects;

-- Anon write-only intake. They can upload to `uploads/...` and delete an
-- upload they just made (Step1Upload.tsx removes pending files by path).
-- They CANNOT SELECT — no listing, no download, no enumeration. This is the
-- bug the reporter exploited.
CREATE POLICY "quote_files_anon_insert_uploads"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'quote-files'
    AND (storage.foldername(name))[1] = 'uploads'
  );

CREATE POLICY "quote_files_anon_delete_uploads"
  ON storage.objects FOR DELETE TO anon
  USING (
    bucket_id = 'quote-files'
    AND (storage.foldername(name))[1] = 'uploads'
  );

-- Authenticated customer can read files that belong to a quote they own
-- (path prefix is the quote id).
CREATE POLICY "quote_files_customer_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-files'
    AND EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id::text = (storage.foldername(name))[1]
        AND q.customer_id = public.current_customer_id()
    )
  );

-- Staff: full access.
CREATE POLICY "quote_files_staff_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'quote-files' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'quote-files' AND public.is_active_staff());

-- Service role: full access.
CREATE POLICY "quote_files_service_role_all"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'quote-files')
  WITH CHECK (bucket_id = 'quote-files');

-- ---------------------------------------------------------------------------
-- 4. Tighten the `invoices` storage bucket.
--    The 20260215 migration created a SELECT policy for ALL authenticated
--    users on every object — drop it and replace with a customer-scoped one.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Customers can download own invoices"  ON storage.objects;
DROP POLICY IF EXISTS "invoices_customer_select"             ON storage.objects;
DROP POLICY IF EXISTS "invoices_staff_all"                   ON storage.objects;
DROP POLICY IF EXISTS "invoices_service_role_all"            ON storage.objects;
DROP POLICY IF EXISTS "Service role full access on invoices" ON storage.objects;

CREATE POLICY "invoices_customer_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1
      FROM public.customer_invoices ci
      WHERE ci.customer_id = public.current_customer_id()
        AND position(ci.id::text in name) > 0
    )
  );

CREATE POLICY "invoices_staff_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'invoices' AND public.is_active_staff());

CREATE POLICY "invoices_service_role_all"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'invoices')
  WITH CHECK (bucket_id = 'invoices');

-- ---------------------------------------------------------------------------
-- 5. Verification queries — informational; safe to leave in.
-- ---------------------------------------------------------------------------

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'customers', 'quotes', 'orders', 'quote_files', 'quote_pages',
    'ai_analysis_results', 'customer_payments', 'customer_invoices', 'refunds'
  )
ORDER BY tablename;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'customers', 'quotes', 'orders', 'quote_files', 'quote_pages',
    'ai_analysis_results', 'customer_payments', 'customer_invoices', 'refunds'
  )
ORDER BY tablename, policyname;

SELECT id, public FROM storage.buckets WHERE id IN ('quote-files', 'invoices');

COMMIT;
