-- ============================================================================
-- Migration: Order Status + Invoice Pipeline
-- Date: February 15, 2026
-- Description: Creates database objects for draft review workflow and invoice
--              generation. All statements use IF NOT EXISTS / DO blocks so
--              this migration is safe to run repeatedly.
-- ============================================================================

-- ============================================================================
-- 1. Add review columns to quote_files (if not already present)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_files' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE quote_files ADD COLUMN review_status varchar(30) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_files' AND column_name = 'review_comment'
  ) THEN
    ALTER TABLE quote_files ADD COLUMN review_comment text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_files' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE quote_files ADD COLUMN reviewed_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_files' AND column_name = 'review_version'
  ) THEN
    ALTER TABLE quote_files ADD COLUMN review_version integer DEFAULT NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. Ensure draft_translation category exists in file_categories
-- ============================================================================
INSERT INTO file_categories (id, name, slug, description, is_billable, display_order, is_active)
VALUES (
  gen_random_uuid(),
  'Draft Translation',
  'draft_translation',
  'Draft translation files awaiting customer review',
  false,
  50,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. Create file_review_history table
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES quote_files(id) ON DELETE CASCADE,
  action varchar(30) NOT NULL,
  actor_type varchar(20) NOT NULL,
  actor_id uuid NOT NULL,
  comment text,
  review_version integer,
  previous_status varchar(30),
  new_status varchar(30),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes for file_review_history
CREATE INDEX IF NOT EXISTS idx_file_review_history_file_id
  ON file_review_history(file_id);
CREATE INDEX IF NOT EXISTS idx_file_review_history_created_at
  ON file_review_history(created_at DESC);

-- RLS for file_review_history
ALTER TABLE file_review_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'file_review_history' AND policyname = 'Service role full access on file_review_history'
  ) THEN
    CREATE POLICY "Service role full access on file_review_history"
      ON file_review_history FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 4. Create invoice_number_seq sequence
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.sequences
    WHERE sequence_name = 'invoice_number_seq'
  ) THEN
    CREATE SEQUENCE invoice_number_seq START WITH 1 INCREMENT BY 1;
  END IF;
END $$;

-- ============================================================================
-- 5. Create generate_invoice_number function
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS varchar(50) AS $$
DECLARE
  seq_val bigint;
  inv_number varchar(50);
BEGIN
  seq_val := nextval('invoice_number_seq');
  inv_number := 'INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(seq_val::text, 6, '0');
  RETURN inv_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Create customer_invoices table
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number varchar(50) UNIQUE NOT NULL DEFAULT generate_invoice_number(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id),
  quote_id uuid REFERENCES quotes(id),

  -- Amounts
  subtotal decimal(12,2) NOT NULL DEFAULT 0,
  certification_total decimal(12,2) NOT NULL DEFAULT 0,
  rush_fee decimal(12,2) NOT NULL DEFAULT 0,
  delivery_fee decimal(12,2) NOT NULL DEFAULT 0,
  tax_rate decimal(5,4) NOT NULL DEFAULT 0,
  tax_amount decimal(12,2) NOT NULL DEFAULT 0,
  total_amount decimal(12,2) NOT NULL DEFAULT 0,
  amount_paid decimal(12,2) NOT NULL DEFAULT 0,
  balance_due decimal(12,2) NOT NULL DEFAULT 0,

  -- Status
  status varchar(20) NOT NULL DEFAULT 'draft',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT (CURRENT_DATE + interval '30 days')::date,
  paid_at timestamptz,
  voided_at timestamptz,

  -- PDF
  pdf_storage_path text,
  pdf_generated_at timestamptz,

  -- Metadata
  trigger_type varchar(20) DEFAULT 'delivery',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for customer_invoices
CREATE INDEX IF NOT EXISTS idx_customer_invoices_order_id
  ON customer_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer_id
  ON customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_status
  ON customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_invoice_date
  ON customer_invoices(invoice_date DESC);

-- RLS for customer_invoices
ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customer_invoices' AND policyname = 'Service role full access on customer_invoices'
  ) THEN
    CREATE POLICY "Service role full access on customer_invoices"
      ON customer_invoices FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Updated_at trigger for customer_invoices
CREATE OR REPLACE FUNCTION update_customer_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_invoices_updated_at ON customer_invoices;
CREATE TRIGGER trg_customer_invoices_updated_at
  BEFORE UPDATE ON customer_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_invoices_updated_at();

-- ============================================================================
-- 7. Create invoices storage bucket
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for invoices bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Service role full access on invoices'
  ) THEN
    CREATE POLICY "Service role full access on invoices"
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'invoices')
      WITH CHECK (bucket_id = 'invoices');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Customers can download own invoices'
  ) THEN
    CREATE POLICY "Customers can download own invoices"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'invoices');
  END IF;
END $$;

-- ============================================================================
-- 8. Create helper function: create_invoice_from_order
-- ============================================================================
CREATE OR REPLACE FUNCTION create_invoice_from_order(p_order_id uuid)
RETURNS uuid AS $$
DECLARE
  v_order record;
  v_invoice_id uuid;
BEGIN
  -- Get order details
  SELECT id, order_number, quote_id, customer_id,
         subtotal, certification_total, rush_fee, delivery_fee,
         tax_rate, tax_amount, total_amount, amount_paid, balance_due
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Create invoice
  INSERT INTO customer_invoices (
    order_id, customer_id, quote_id,
    subtotal, certification_total, rush_fee, delivery_fee,
    tax_rate, tax_amount, total_amount, amount_paid, balance_due,
    status, trigger_type
  ) VALUES (
    v_order.id, v_order.customer_id, v_order.quote_id,
    v_order.subtotal, v_order.certification_total, v_order.rush_fee, v_order.delivery_fee,
    v_order.tax_rate, v_order.tax_amount, v_order.total_amount, v_order.amount_paid, v_order.balance_due,
    CASE WHEN v_order.balance_due <= 0 THEN 'paid' ELSE 'issued' END,
    'delivery'
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Done
-- ============================================================================
