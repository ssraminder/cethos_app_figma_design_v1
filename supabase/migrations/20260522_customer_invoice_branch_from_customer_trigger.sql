-- Per-client branch is the source of truth for customer_invoices.invoicing_branch_id.
-- Old schema default of 2 meant any INSERT that omitted the column silently landed
-- on 12537494 Canada Inc. even if the customer is on Cethos Solutions Inc. — caused
-- 24 portal-native invoices in 2026 to be attributed to the wrong branch.
--
-- This trigger fills the column from the customer on INSERT whenever the caller
-- doesn't supply one. Callers that pass an explicit branch are honored (e.g.
-- historical imports that already attribute correctly).
--
-- Existing rows are NOT backfilled — per user direction, this fix is for
-- new invoices going forward.

-- 1. Drop schema default so omitted column → NULL → trigger fires.
ALTER TABLE public.customer_invoices
  ALTER COLUMN invoicing_branch_id DROP DEFAULT;

-- 2. Trigger: when NULL on insert, read customer's invoicing_branch_id.
CREATE OR REPLACE FUNCTION public.set_customer_invoice_branch_from_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoicing_branch_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT invoicing_branch_id
      INTO NEW.invoicing_branch_id
    FROM public.customers
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_invoice_branch_from_customer ON public.customer_invoices;
CREATE TRIGGER trg_customer_invoice_branch_from_customer
  BEFORE INSERT ON public.customer_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_invoice_branch_from_customer();

COMMENT ON FUNCTION public.set_customer_invoice_branch_from_customer() IS
  'Fills customer_invoices.invoicing_branch_id from the customer when caller omits it. '
  'Source of truth is customers.invoicing_branch_id (set per client).';
