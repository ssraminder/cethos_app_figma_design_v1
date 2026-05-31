-- Multi-language quote/order fan-out: symmetric parent/child on quotes AND orders.
-- parent_quote_id NULL  = standalone or payable parent quote (customer pays this)
-- parent_quote_id NOT NULL = single-pair child quote (never independently payable)
-- parent_order_id NULL  = standalone or customer-facing parent order (money lives here)
-- parent_order_id NOT NULL = single-pair child work-unit order (vendors + $0 financials)

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS parent_quote_id uuid REFERENCES quotes(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS idx_quotes_parent_quote_id
  ON quotes(parent_quote_id) WHERE parent_quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id
  ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- convert_quote_to_orders(parent_quote_id, payment)
-- One atomic routine both conversion paths (Stripe prepay, AR approval) call.
-- N=1 (no children): inserts ONE order — byte-for-byte today's behavior.
-- N>1 (children):    inserts 1 parent order (full money) + N child orders ($0 work units).
-- Idempotent on quotes.converted_to_order_id.
--
-- p_payment shape:
--   { "method": "stripe"|"ar",
--     "currency": "CAD",                       (optional override)
--     "amount_paid": <numeric>,                (stripe: full total; ar: 0)
--     "stripe_checkout_session_id": <text>,    (stripe only)
--     "stripe_payment_intent_id":  <text>,     (stripe only)
--     "advance_percentage": <numeric> }        (ar only, optional)
-- Returns: { "parent_order_id": uuid, "child_orders": [ {order_id, order_number, quote_id} ] }
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION convert_quote_to_orders(
  p_quote_id uuid,
  p_payment  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote        quotes%ROWTYPE;
  v_child        quotes%ROWTYPE;
  v_method       text  := lower(coalesce(p_payment->>'method', 'stripe'));
  v_currency     text;
  v_now          timestamptz := now();
  v_order_status text;
  v_quote_status text;
  v_parent_order_id uuid;
  v_parent_order_number text;
  v_total        numeric;
  v_amount_paid  numeric;
  v_balance_due  numeric;
  v_session      text  := p_payment->>'stripe_checkout_session_id';
  v_intent       text  := p_payment->>'stripe_payment_intent_id';
  v_child_order_id uuid;
  v_child_order_number text;
  v_children     jsonb := '[]'::jsonb;
BEGIN
  -- Lock the parent quote for the duration of the transaction.
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  -- Idempotency: already converted → return existing mapping.
  IF v_quote.converted_to_order_id IS NOT NULL THEN
    SELECT coalesce(
             jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'order_number', o.order_number, 'quote_id', o.quote_id)),
             '[]'::jsonb)
      INTO v_children
      FROM orders o
     WHERE o.parent_order_id = v_quote.converted_to_order_id;
    RETURN jsonb_build_object(
      'parent_order_id', v_quote.converted_to_order_id,
      'child_orders', v_children,
      'idempotent', true);
  END IF;

  v_total    := coalesce(v_quote.total, 0);
  v_currency := upper(coalesce(p_payment->>'currency', v_quote.currency, 'CAD'));

  IF v_method = 'ar' THEN
    v_order_status := 'balance_due';
    v_quote_status := 'ar_approved';
    v_amount_paid  := coalesce((p_payment->>'amount_paid')::numeric, 0);
    v_balance_due  := v_total - v_amount_paid;
  ELSE
    v_order_status := 'paid';
    v_quote_status := 'paid';
    v_amount_paid  := coalesce((p_payment->>'amount_paid')::numeric, v_total);
    v_balance_due  := v_total - v_amount_paid;
  END IF;

  -- ── Parent / standalone order: full money, customer-facing ────────────────
  INSERT INTO orders (
    quote_id, customer_id, status, work_status,
    subtotal, certification_total, rush_fee, delivery_fee,
    tax_rate, tax_amount, total_amount, amount_paid, balance_due,
    currency, estimated_delivery_date, is_rush,
    internal_project_id, parent_order_id,
    paid_at
  ) VALUES (
    v_quote.id, v_quote.customer_id, v_order_status, 'pending',
    coalesce(v_quote.subtotal, 0), coalesce(v_quote.certification_total, 0),
    coalesce(v_quote.rush_fee, 0), coalesce(v_quote.delivery_fee, 0),
    coalesce(v_quote.tax_rate, 0), coalesce(v_quote.tax_amount, 0),
    v_total, v_amount_paid, v_balance_due,
    v_currency, v_quote.estimated_delivery_date, (v_quote.turnaround_type = 'rush'),
    v_quote.internal_project_id, NULL,
    CASE WHEN v_method = 'ar' THEN NULL ELSE v_now END
  )
  RETURNING id, order_number INTO v_parent_order_id, v_parent_order_number;

  -- ── Canonical payment row (Stripe prepay only) ────────────────────────────
  IF v_method <> 'ar' AND v_session IS NOT NULL THEN
    INSERT INTO payments (
      order_id, amount, currency, payment_type, payment_method, status,
      stripe_checkout_session_id, stripe_payment_intent_id
    ) VALUES (
      v_parent_order_id, v_amount_paid, v_currency, 'initial', 'stripe', 'succeeded',
      v_session, v_intent
    );
  END IF;

  -- ── Update parent quote: mark converted ───────────────────────────────────
  IF v_method = 'ar' THEN
    UPDATE quotes SET
      status = v_quote_status,
      billing_mode = 'ar_invoice',
      approved_at = v_now,
      approved_by_customer_id = v_quote.customer_id,
      converted_to_order_id = v_parent_order_id
    WHERE id = v_quote.id;
  ELSE
    UPDATE quotes SET
      status = v_quote_status,
      converted_to_order_id = v_parent_order_id,
      stripe_checkout_session_id = coalesce(v_session, stripe_checkout_session_id),
      paid_at = v_now
    WHERE id = v_quote.id;
  END IF;

  -- ── Child work-unit orders (one per single-pair child quote) ──────────────
  FOR v_child IN
    SELECT * FROM quotes
     WHERE parent_quote_id = v_quote.id
     ORDER BY created_at, quote_number
  LOOP
    INSERT INTO orders (
      quote_id, customer_id, status, work_status,
      subtotal, certification_total, rush_fee, delivery_fee,
      tax_rate, tax_amount, total_amount, amount_paid, balance_due,
      currency, estimated_delivery_date, is_rush,
      internal_project_id, parent_order_id
    ) VALUES (
      v_child.id, v_child.customer_id, v_order_status, 'pending',
      coalesce(v_child.subtotal, 0), coalesce(v_child.certification_total, 0),
      coalesce(v_child.rush_fee, 0), coalesce(v_child.delivery_fee, 0),
      coalesce(v_child.tax_rate, 0), coalesce(v_child.tax_amount, 0),
      coalesce(v_child.total, 0), 0, 0,
      v_currency, v_child.estimated_delivery_date, (v_child.turnaround_type = 'rush'),
      v_quote.internal_project_id, v_parent_order_id
    )
    RETURNING id, order_number INTO v_child_order_id, v_child_order_number;

    UPDATE quotes SET
      status = v_quote_status,
      converted_to_order_id = v_child_order_id
    WHERE id = v_child.id;

    v_children := v_children || jsonb_build_object(
      'order_id', v_child_order_id,
      'order_number', v_child_order_number,
      'quote_id', v_child.id);
  END LOOP;

  RETURN jsonb_build_object(
    'parent_order_id', v_parent_order_id,
    'parent_order_number', v_parent_order_number,
    'child_orders', v_children,
    'idempotent', false);
END;
$$;
