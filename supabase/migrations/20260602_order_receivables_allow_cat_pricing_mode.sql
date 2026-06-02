-- Phase B-2 of #2.5: allow pricing_mode='cat' alongside per_unit / target
-- so the new manage-receivables.create_receivable cat mode can write rows.
ALTER TABLE public.order_receivables
  DROP CONSTRAINT IF EXISTS order_receivables_pricing_mode_check;
ALTER TABLE public.order_receivables
  ADD CONSTRAINT order_receivables_pricing_mode_check
  CHECK (pricing_mode = ANY (ARRAY['per_unit'::text, 'target'::text, 'cat'::text]));
