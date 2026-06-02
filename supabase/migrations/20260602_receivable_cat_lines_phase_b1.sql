-- Phase B-1 of #2.5: receivable_cat_lines mirrors vendor_payable_cat_lines
-- for the customer-side CAT analysis breakdown. Parent row is
-- order_receivables.id (1-to-many: one receivable line → N tier rows).

CREATE TABLE IF NOT EXISTS public.receivable_cat_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.order_receivables(id) ON DELETE CASCADE,
  match_tier text NOT NULL,                  -- 'new' | 'fuzzy_50_74' | ... matches vendor side
  tier_label text NULL,                       -- human-readable, e.g. '95-99% fuzzy'
  word_count numeric NOT NULL CHECK (word_count >= 0),
  tier_percentage numeric NOT NULL CHECK (tier_percentage >= 0 AND tier_percentage <= 5),
  base_rate numeric NOT NULL CHECK (base_rate > 0),   -- per-word base rate at parent receivable level
  line_subtotal numeric NOT NULL CHECK (line_subtotal >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS receivable_cat_lines_receivable_idx
  ON public.receivable_cat_lines(receivable_id);

COMMENT ON TABLE public.receivable_cat_lines IS
  'Phase B-1 of #2.5: customer-facing CAT analysis tier rows per order_receivables line. Mirrors vendor_payable_cat_lines for the receivable side. Subtotal in the parent receivable row = SUM(line_subtotal).';

ALTER TABLE public.receivable_cat_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY receivable_cat_lines_staff_all ON public.receivable_cat_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN public.staff_users su ON su.email = u.email
      WHERE u.id = auth.uid() AND su.is_active = true
    )
  );
