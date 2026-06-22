-- Vendor Purchase Orders — auto-issued when a vendor accepts an assignment/offer.
-- Foundation: VPO numbering, tables, queue, accept trigger (kill-switch gated), bucket.
-- Applied to prod via MCP on 2026-06-20.

-- 1. PO number: VPO-YYYY-NNNNN from an atomic sequence (never count(*)+1).
CREATE SEQUENCE IF NOT EXISTS public.vendor_po_seq START 1;
CREATE OR REPLACE FUNCTION public.next_vendor_po_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'VPO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.vendor_po_seq')::text, 5, '0');
$$;

-- 2. PO header (one per accepted step+vendor).
CREATE TABLE IF NOT EXISTS public.vendor_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  workflow_step_id uuid REFERENCES public.order_workflow_steps(id),
  vendor_payable_id uuid REFERENCES public.vendor_payables(id),
  vendor_id uuid REFERENCES public.vendors(id),
  step_name text, service text, source_language text, target_language text,
  rate numeric, rate_unit text, units numeric,
  currency text DEFAULT 'USD', subtotal numeric, total numeric,
  deadline timestamptz, notes text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','acknowledged','revised','void','error')),
  pdf_storage_path text, generated_at timestamptz, sent_at timestamptz, emailed_to text, error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_po_step_vendor
  ON public.vendor_purchase_orders(workflow_step_id, vendor_id);

-- 3. Queue (decouples PO send from the accept transaction; retryable).
CREATE TABLE IF NOT EXISTS public.vendor_po_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_id uuid NOT NULL, vendor_id uuid NOT NULL, order_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  attempts int NOT NULL DEFAULT 0, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vendor_po_queue_pending ON public.vendor_po_queue(status) WHERE status = 'pending';

-- 4. Kill-switch (default OFF — build first, enable later).
INSERT INTO public.cvp_system_config(key, value, description)
VALUES ('vendor_po_autosend', 'false'::jsonb,
        'Auto-generate + email a vendor PO when a vendor accepts an assignment/offer (step -> accepted).')
ON CONFLICT (key) DO NOTHING;

-- 5. Accept trigger -> enqueue (only when autosend ON and not already issued/queued).
CREATE OR REPLACE FUNCTION public.enqueue_vendor_po_on_accept()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND NEW.vendor_id IS NOT NULL
     AND COALESCE((SELECT value FROM public.cvp_system_config WHERE key='vendor_po_autosend'), 'false'::jsonb) = 'true'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.vendor_purchase_orders po WHERE po.workflow_step_id = NEW.id AND po.vendor_id = NEW.vendor_id)
     AND NOT EXISTS (SELECT 1 FROM public.vendor_po_queue q WHERE q.workflow_step_id = NEW.id AND q.vendor_id = NEW.vendor_id AND q.status IN ('pending','processing'))
  THEN
    INSERT INTO public.vendor_po_queue(workflow_step_id, vendor_id, order_id)
    SELECT NEW.id, NEW.vendor_id, wf.order_id
    FROM public.order_workflows wf WHERE wf.id = NEW.workflow_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enqueue_vendor_po_on_accept ON public.order_workflow_steps;
CREATE TRIGGER trg_enqueue_vendor_po_on_accept
AFTER UPDATE OF status ON public.order_workflow_steps
FOR EACH ROW EXECUTE FUNCTION public.enqueue_vendor_po_on_accept();

-- 6. Private bucket for PO PDFs.
INSERT INTO storage.buckets(id, name, public) VALUES ('vendor-pos', 'vendor-pos', false)
ON CONFLICT (id) DO NOTHING;

-- 7. Cron: drain the PO queue every 2 min (process-vendor-po-queue). Body {} =>
-- respects the vendor_po_autosend kill-switch, so it harmlessly no-ops until ON.
SELECT cron.schedule('process-vendor-po-queue', '*/2 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/process-vendor-po-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$cron$);
