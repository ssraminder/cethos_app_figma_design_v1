-- Link public_submissions to a customer when the upload originates from the
-- authenticated customer portal. null = anonymous submission from main_web.

ALTER TABLE public.public_submissions
  ADD COLUMN IF NOT EXISTS customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_public_submissions_customer_id
  ON public.public_submissions (customer_id) WHERE customer_id IS NOT NULL;
