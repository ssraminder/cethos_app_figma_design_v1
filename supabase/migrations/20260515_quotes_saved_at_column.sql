-- =====================================================================
-- Add quotes.saved_at — client (Step4ReviewCheckout.tsx:1892) writes
-- this column when a customer saves their quote-in-progress, and the
-- customer-quote-get edge function SELECTs it. The column was referenced
-- in code but never added to the schema, breaking the entire customer
-- quote-recovery flow with `column quotes.saved_at does not exist` 500s
-- when any returning visitor reached Step 4 (Checkout) with a draft in
-- localStorage.
--
-- Discovered 2026-05-15 during the admin-portal QA sweep — the live
-- portal.cethos.com/quote page showed "No pricing data available — Edge
-- Function returned a non-2xx status code" for any returning visitor
-- with a `cethos_quote_draft` in localStorage. Verified: after the
-- ALTER, the same /quote URL renders the full Review & Checkout step
-- with Order Summary + Pay button.
-- =====================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;

COMMENT ON COLUMN public.quotes.saved_at IS
  'Timestamp when the customer clicked "Save quote" on Step 4 of the quote builder. Distinct from updated_at (any mutation) and created_at (initial draft).';
