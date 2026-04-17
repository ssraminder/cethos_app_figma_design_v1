-- Cache Stripe card details on the payments row so the admin order detail
-- page can show last 4, brand, and a receipt link without hitting Stripe on
-- every page load. Backfilled lazily by get-order-workflow the first time an
-- admin views an order.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS card_brand        varchar(40),
  ADD COLUMN IF NOT EXISTS card_last4        varchar(4),
  ADD COLUMN IF NOT EXISTS card_exp_month    integer,
  ADD COLUMN IF NOT EXISTS card_exp_year     integer,
  ADD COLUMN IF NOT EXISTS cardholder_name   text,
  ADD COLUMN IF NOT EXISTS card_country      varchar(2),
  ADD COLUMN IF NOT EXISTS stripe_enriched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
