-- ============================================================================
-- Fix create_invoice_from_order to use branch-aware invoice numbering
-- Problem: Was calling generate_invoice_number() which hardcodes 'INV-' prefix
-- Fix: Resolve branch from customer, call next_invoice_number(branch_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(
  p_order_id uuid,
  p_trigger_type character varying DEFAULT 'delivery'::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_customer RECORD;
  v_branch_id INTEGER;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_due_date DATE;
  v_existing_invoice UUID;
BEGIN
  -- Check if invoice already exists for this order
  SELECT id INTO v_existing_invoice
  FROM customer_invoices
  WHERE order_id = p_order_id AND status NOT IN ('void', 'cancelled');

  IF v_existing_invoice IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invoice already exists for this order',
      'invoice_id', v_existing_invoice
    );
  END IF;

  -- Get order details (including invoicing_branch_id)
  SELECT
    o.id, o.order_number, o.quote_id, o.customer_id,
    o.subtotal, o.certification_total, o.rush_fee, o.delivery_fee,
    o.tax_rate, o.tax_amount, o.total_amount, o.amount_paid, o.balance_due,
    o.invoicing_branch_id AS order_branch_id
  INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Get customer details for branch resolution
  SELECT id, invoicing_branch_id
  INTO v_customer
  FROM customers
  WHERE id = v_order.customer_id;

  -- Resolve branch: order > customer > default (2)
  v_branch_id := COALESCE(v_order.order_branch_id, v_customer.invoicing_branch_id, 2);

  -- Generate branch-aware invoice number
  v_invoice_number := next_invoice_number(v_branch_id);
  v_due_date := calculate_invoice_due_date(v_order.customer_id);

  -- Create invoice with correct branch
  INSERT INTO customer_invoices (
    invoice_number, order_id, customer_id, quote_id,
    subtotal, certification_total, rush_fee, delivery_fee,
    tax_rate, tax_amount, total_amount,
    amount_paid, balance_due,
    status, invoice_date, due_date, trigger_type,
    invoicing_branch_id
  ) VALUES (
    v_invoice_number, p_order_id, v_order.customer_id, v_order.quote_id,
    v_order.subtotal, v_order.certification_total, v_order.rush_fee, v_order.delivery_fee,
    COALESCE(v_order.tax_rate, 0.05), v_order.tax_amount, v_order.total_amount,
    v_order.amount_paid, v_order.balance_due,
    CASE WHEN v_order.balance_due <= 0 THEN 'paid' ELSE 'issued' END,
    CURRENT_DATE, v_due_date, p_trigger_type,
    v_branch_id
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'due_date', v_due_date,
    'total_amount', v_order.total_amount,
    'balance_due', v_order.balance_due
  );
END;
$function$;
