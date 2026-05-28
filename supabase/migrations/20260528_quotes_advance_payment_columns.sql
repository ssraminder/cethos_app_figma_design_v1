-- Advance payment request fields on quotes.
--
-- advance_percentage: NULL or 0 means no advance requested (PDF shows "NIL").
-- A positive value indicates the customer must pay that % of the total before
-- work begins. advance_amount is a generated column for stable display.
-- advance_received_at flips when the advance lands (set by the payment flow,
-- not by the PDF generator).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS advance_percentage numeric(5,2)
    CHECK (advance_percentage IS NULL OR (advance_percentage >= 0 AND advance_percentage <= 100));

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS advance_amount numeric(12,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN advance_percentage IS NULL OR advance_percentage = 0 THEN NULL
        ELSE ROUND(COALESCE(total, 0) * advance_percentage / 100.0, 2)
      END
    ) STORED;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS advance_received_at timestamptz;

COMMENT ON COLUMN public.quotes.advance_percentage IS 'Advance payment requested as % of total (0-100). NULL/0 = no advance.';
COMMENT ON COLUMN public.quotes.advance_amount IS 'Generated: total * advance_percentage / 100. NULL when no advance.';
COMMENT ON COLUMN public.quotes.advance_received_at IS 'When the advance was confirmed received. Work begins once set.';
