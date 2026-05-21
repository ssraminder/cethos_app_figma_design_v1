-- Portal-recorded outgoing payments to vendors.
-- Separate from cvp_payments (order-step tied) and the XTRF payment history
-- embedded as JSONB in xtrf_vendor_invoice_cache.

CREATE TABLE IF NOT EXISTS public.vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency varchar(8) NOT NULL DEFAULT 'CAD',
  amount_cad numeric(14,2),
  exchange_rate_to_cad numeric(14,8),
  exchange_rate_date date,
  payment_date date NOT NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id),
  payment_method varchar(64),
  payment_method_code varchar(64),
  payment_method_name varchar(128),
  reference_number varchar(255),
  notes text,
  source text NOT NULL DEFAULT 'manual',
  status varchar(32) NOT NULL DEFAULT 'unallocated'
    CHECK (status IN ('unallocated','partially_allocated','fully_allocated','completed','cancelled','refunded')),
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  unallocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  confirmed_by_staff_id uuid,
  paystub_filename text,
  paystub_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_payments_vendor_idx ON public.vendor_payments (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_payments_status_idx ON public.vendor_payments (status);
CREATE INDEX IF NOT EXISTS vendor_payments_date_idx ON public.vendor_payments (payment_date DESC);

-- Allocations: a single payment can pay down (a) portal vendor_payables rows
-- and/or (b) XTRF-imported invoice rows from xtrf_vendor_invoice_cache.
-- Exactly one of payable_id / xtrf_invoice_id is non-null.
CREATE TABLE IF NOT EXISTS public.vendor_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.vendor_payments(id) ON DELETE CASCADE,
  payable_id uuid REFERENCES public.vendor_payables(id),
  xtrf_invoice_id integer REFERENCES public.xtrf_vendor_invoice_cache(id),
  allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT vendor_payment_allocations_exactly_one_target
    CHECK ((payable_id IS NULL) <> (xtrf_invoice_id IS NULL))
);
CREATE INDEX IF NOT EXISTS vp_alloc_payment_idx
  ON public.vendor_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS vp_alloc_payable_idx
  ON public.vendor_payment_allocations (payable_id) WHERE payable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vp_alloc_xtrf_idx
  ON public.vendor_payment_allocations (xtrf_invoice_id) WHERE xtrf_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recalc_vendor_payment_allocation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_payment_id uuid;
  v_total_alloc numeric(14,2);
  v_amount numeric(14,2);
  v_new_status text;
BEGIN
  v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_alloc
    FROM public.vendor_payment_allocations WHERE payment_id = v_payment_id;
  SELECT amount INTO v_amount FROM public.vendor_payments WHERE id = v_payment_id;
  IF v_amount IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF v_total_alloc <= 0 THEN v_new_status := 'unallocated';
  ELSIF v_total_alloc >= v_amount THEN v_new_status := 'fully_allocated';
  ELSE v_new_status := 'partially_allocated';
  END IF;
  UPDATE public.vendor_payments
     SET allocated_amount = v_total_alloc,
         unallocated_amount = GREATEST(v_amount - v_total_alloc, 0),
         status = CASE WHEN status IN ('cancelled','refunded','completed')
                       THEN status ELSE v_new_status END,
         updated_at = now()
   WHERE id = v_payment_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_vendor_payment_allocation
  ON public.vendor_payment_allocations;
CREATE TRIGGER trg_recalc_vendor_payment_allocation
  AFTER INSERT OR UPDATE OR DELETE ON public.vendor_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.recalc_vendor_payment_allocation();

CREATE OR REPLACE FUNCTION public.sync_vendor_payment_unallocated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.unallocated_amount := COALESCE(NEW.amount, 0) - COALESCE(NEW.allocated_amount, 0);
  ELSE
    NEW.unallocated_amount := GREATEST(
      COALESCE(NEW.amount, 0) - COALESCE(NEW.allocated_amount, 0), 0);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vendor_payment_unallocated ON public.vendor_payments;
CREATE TRIGGER trg_sync_vendor_payment_unallocated
  BEFORE INSERT OR UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_vendor_payment_unallocated();

COMMENT ON TABLE public.vendor_payments IS
  'Portal-recorded outgoing payments to vendors. Separate from cvp_payments (order-step tied) and xtrf_vendor_invoice_cache.payments (XTRF historical jsonb).';
COMMENT ON TABLE public.vendor_payment_allocations IS
  'Polymorphic: each allocation targets either a portal vendor_payable or an XTRF-imported invoice (exactly one).';
