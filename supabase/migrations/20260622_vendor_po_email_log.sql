-- Audit log for vendor-PO sends (auto pipeline + manual resends from the admin
-- step card). One row per send attempt; written by send-vendor-po.
-- Applied to prod via MCP on 2026-06-22.
CREATE TABLE IF NOT EXISTS public.vendor_po_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.vendor_purchase_orders(id) ON DELETE CASCADE,
  po_number text,
  sent_to text,
  subject text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error text,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  triggered_by uuid,            -- staff_users.id; NULL = system/auto
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendor_po_email_log_po ON public.vendor_po_email_log(po_id, created_at DESC);
