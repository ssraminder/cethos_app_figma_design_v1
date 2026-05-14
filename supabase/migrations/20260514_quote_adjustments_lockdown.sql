-- ============================================================================
-- Lock down quote_adjustments under the same four-tier model used by the
-- emergency lockdown migration (service_role / staff / customer-own / anon).
--
-- This table holds staff-applied discounts and surcharges with reason text
-- and a staff_users FK in `added_by`. The customer flow only needs to READ
-- adjustments that belong to a quote they own; never write.
--
-- Step4ReviewCheckout reads from this table during checkout, so the
-- customer policy MUST also cover the anon path while a quote is still
-- pre-payment. We do that through the customer-quote-get edge function
-- (service-role bypass) rather than by adding an anon policy here.
-- ============================================================================

BEGIN;

ALTER TABLE public.quote_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_adjustments_service_role_all ON public.quote_adjustments;
DROP POLICY IF EXISTS quote_adjustments_staff_all        ON public.quote_adjustments;
DROP POLICY IF EXISTS quote_adjustments_customer_select  ON public.quote_adjustments;

CREATE POLICY quote_adjustments_service_role_all ON public.quote_adjustments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY quote_adjustments_staff_all ON public.quote_adjustments
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());

CREATE POLICY quote_adjustments_customer_select ON public.quote_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_adjustments.quote_id
        AND q.customer_id = public.current_customer_id()
    )
  );

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'quote_adjustments';

SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'quote_adjustments'
ORDER BY policyname;

COMMIT;
