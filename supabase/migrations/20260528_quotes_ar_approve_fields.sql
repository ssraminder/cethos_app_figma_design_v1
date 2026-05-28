-- AR-approve flow on the customer quote-review page.
--
-- When an AR-approved customer clicks "Approve & bill on AR (Net 30)" on
-- their quote-review page, we flip the quote into 'ar_approved', record
-- who/when approved, and tag the billing_mode so downstream code knows the
-- order was greenlit for AR billing (no Stripe payment captured).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS billing_mode text
    CHECK (billing_mode IS NULL OR billing_mode IN ('stripe', 'ar_invoice'));

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check CHECK (
    (status)::text = ANY (
      ARRAY[
        'draft'::character varying,
        'details_pending'::character varying,
        'processing'::character varying,
        'lead'::character varying,
        'quote_ready'::character varying,
        'approved'::character varying,
        'ar_approved'::character varying,
        'pending_payment'::character varying,
        'checkout_started'::character varying,
        'awaiting_payment'::character varying,
        'in_review'::character varying,
        'paid'::character varying,
        'converted'::character varying,
        'revision_needed'::character varying,
        'expired'::character varying,
        'cancelled'::character varying
      ]::text[]
    )
  );

COMMENT ON COLUMN public.quotes.approved_at IS 'When the customer approved the quote (AR or otherwise).';
COMMENT ON COLUMN public.quotes.approved_by_customer_id IS 'The customer who approved the quote via the magic-link review page.';
COMMENT ON COLUMN public.quotes.billing_mode IS 'How this quote is being settled: stripe (immediate) or ar_invoice (Net 30).';
