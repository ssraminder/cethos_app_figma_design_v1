-- =====================================================================
-- RLS remediation (2026-06-23) — table 1 of 22: ads_offline_conversions
--
-- Part of the per-table RLS rollout closing the Supabase advisor
-- "rls_disabled_in_public" findings (see docs/rls-remediation-status.md).
--
-- ads_offline_conversions is the internal Google Ads offline-conversion
-- upload queue. It stores gclid / gbraid / wbraid click identifiers tied to
-- specific paid orders, conversion values, and upload status. It has NO
-- legitimate anon/authenticated client access (verified by grep across the
-- admin client, the vendor portal, and edge functions — zero references).
-- With RLS off it was world-readable: the anon key returned all 31 rows.
--
-- Writer: trigger trg_orders_queue_ads_oc on public.orders calls
-- queue_ads_offline_conversion() when orders.paid_at transitions to NOT NULL.
-- That function was SECURITY INVOKER, so its INSERT ran as whatever role set
-- paid_at. Today only service_role edge functions (stripe-webhook,
-- admin-create-order, crm-create-order) set paid_at, so the INSERT would keep
-- working — but to make the queue write safe-by-construction (so a future
-- authenticated "mark paid" path can never be hard-failed by RLS), the trigger
-- is converted to SECURITY DEFINER. Owner = postgres (rolbypassrls = true),
-- so the trigger INSERT bypasses RLS regardless of caller. Body unchanged.
--
-- Result: anon/authenticated get 0 rows and no writes; service_role (edge
-- functions / cron uploader) retains full access; the orders paid-trigger
-- keeps queueing conversions from every code path.
--
-- Rollback:
--   ALTER TABLE public.ads_offline_conversions DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS ads_offline_conversions_service_role_all ON public.ads_offline_conversions;
--   -- (and, if desired, recreate queue_ads_offline_conversion() as SECURITY INVOKER)
-- =====================================================================

BEGIN;

-- 1. Harden the trigger writer: SECURITY DEFINER so the queue INSERT always
--    succeeds regardless of which role marks an order paid. Body byte-identical
--    to the prior SECURITY INVOKER version; only the security clause + an
--    explicit (injection-safe) search_path are added.
CREATE OR REPLACE FUNCTION public.queue_ads_offline_conversion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  conv_time    TIMESTAMPTZ;
  conv_value   NUMERIC(10,2);
  has_click_id BOOLEAN;
BEGIN
  IF NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.paid_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  has_click_id := (NEW.gclid IS NOT NULL OR NEW.gbraid IS NOT NULL OR NEW.wbraid IS NOT NULL);
  IF NOT has_click_id THEN
    RETURN NEW;
  END IF;
  conv_time  := NEW.paid_at;
  conv_value := COALESCE(NEW.total_amount_cad, NEW.total_amount, 0);
  IF conv_value <= 0 THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM ads_offline_conversions WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO ads_offline_conversions (
    order_id, quote_id, gclid, gbraid, wbraid, customer_id, conversion_action,
    conversion_date_time, conversion_value, currency_code, order_id_for_upload
  ) VALUES (
    NEW.id, NEW.quote_id, NEW.gclid, NEW.gbraid, NEW.wbraid,
    '6316159162', 'customers/6316159162/conversionActions/7586548300',
    conv_time, conv_value, COALESCE(NEW.currency, 'CAD'),
    COALESCE(NEW.order_number, NEW.id::text)
  );
  RETURN NEW;
END;
$function$;

-- 2. Enable RLS and restrict the queue to service_role only.
ALTER TABLE public.ads_offline_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ads_offline_conversions_service_role_all ON public.ads_offline_conversions;
CREATE POLICY ads_offline_conversions_service_role_all
  ON public.ads_offline_conversions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
