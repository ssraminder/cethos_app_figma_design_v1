-- 2026-05-21 — Backfill orders.certification_type_id on quote→order conversion.
--
-- The process-manual-payment edge function creates an order row from a paid
-- quote but does NOT populate orders.certification_type_id even when the
-- quote has certification configured. Downstream (e.g. apply-affidavit-and-
-- finalize) reads from that column and fails with
-- ORDER_MISSING_CERTIFICATION_TYPE.
--
-- This trigger fills the gap at the DB layer so every quote→order path
-- benefits, not just one edge function. Source of truth, in order of
-- preference:
--   1. The first quote_certifications row for this quote (created_at asc) —
--      this is the cert(s) the customer explicitly added to the quote
--   2. intended_uses.default_certification_type_id for the quote's
--      intended_use_id — covers fast-quote / kiosk paths that don't insert
--      into quote_certifications
--
-- Trigger fires BEFORE INSERT only — never overwrites an explicitly-set
-- cert (NEW.certification_type_id IS NULL gate).
--
-- Matches the existing BEFORE-INSERT pattern on orders
-- (trg_order_copy_branch, trg_orders_copy_tracking, trg_orders_lock_cad,
-- trigger_generate_order_number).

CREATE OR REPLACE FUNCTION public.copy_quote_cert_to_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cert_id UUID;
  v_intended_use_id UUID;
BEGIN
  IF NEW.certification_type_id IS NOT NULL OR NEW.quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Source #1: explicit quote_certifications rows
  SELECT certification_type_id INTO v_cert_id
  FROM public.quote_certifications
  WHERE quote_id = NEW.quote_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- Source #2: intended_uses default
  IF v_cert_id IS NULL THEN
    SELECT intended_use_id INTO v_intended_use_id
    FROM public.quotes WHERE id = NEW.quote_id;

    IF v_intended_use_id IS NOT NULL THEN
      SELECT default_certification_type_id INTO v_cert_id
      FROM public.intended_uses
      WHERE id = v_intended_use_id;
    END IF;
  END IF;

  IF v_cert_id IS NOT NULL THEN
    NEW.certification_type_id := v_cert_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_copy_cert_from_quote ON public.orders;
CREATE TRIGGER trg_orders_copy_cert_from_quote
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.copy_quote_cert_to_order();
