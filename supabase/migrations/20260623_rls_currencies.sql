-- =====================================================================
-- RLS remediation (2026-06-23) — table 11 of 22: currencies
--
-- Currency reference + exchange rates (78 rows). MUST stay readable by anon AND
-- authenticated: the SECURITY INVOKER trigger functions lock_quote_cad_amounts /
-- lock_order_cad_amounts / lock_payment_cad_amount / lock_refund_cad_amount read
-- currencies.exchange_rate_to_cad when a quote/order/payment/refund is inserted, and
-- those run in the inserting role's context (incl. anon quote creation). Also read by
-- admin (CustomerDetail, AdminVendorDetail) and edge functions. No authenticated
-- writer (exchange-rate refresh runs via service_role / cron) -> no staff_manage policy.
--
-- Verified: anon/auth/service all read 78.
--
-- Rollback:
--   ALTER TABLE public.currencies DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS currencies_public_read ON public.currencies;
--   DROP POLICY IF EXISTS currencies_service_role_all ON public.currencies;
-- =====================================================================

BEGIN;

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS currencies_public_read ON public.currencies;
CREATE POLICY currencies_public_read
  ON public.currencies FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS currencies_service_role_all ON public.currencies;
CREATE POLICY currencies_service_role_all
  ON public.currencies FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
