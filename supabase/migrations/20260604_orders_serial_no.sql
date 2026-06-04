-- Stable, immutable per-order serial number used by internal staff when
-- referring to orders in chat / tickets. Assigned at INSERT via a
-- dedicated sequence so pin / drag-reorder / sort can never change it.

CREATE SEQUENCE IF NOT EXISTS public.orders_serial_no_seq;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS serial_no BIGINT;

-- Backfill existing rows in creation order: #1 = oldest order ever.
UPDATE public.orders o
SET serial_no = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM public.orders
  WHERE serial_no IS NULL
) sub
WHERE o.id = sub.id
  AND o.serial_no IS NULL;

-- Advance the sequence past the backfilled max so new inserts continue
-- the sequence (not collide with backfill).
SELECT setval(
  'public.orders_serial_no_seq',
  GREATEST(COALESCE((SELECT MAX(serial_no) FROM public.orders), 0), 1),
  true
);

ALTER TABLE public.orders
  ALTER COLUMN serial_no SET DEFAULT nextval('public.orders_serial_no_seq'),
  ALTER COLUMN serial_no SET NOT NULL;

ALTER SEQUENCE public.orders_serial_no_seq OWNED BY public.orders.serial_no;

CREATE UNIQUE INDEX IF NOT EXISTS orders_serial_no_key
  ON public.orders (serial_no);

CREATE INDEX IF NOT EXISTS orders_serial_no_idx
  ON public.orders (serial_no);

COMMENT ON COLUMN public.orders.serial_no IS
  'Immutable per-order serial number for internal reference. Assigned at INSERT via orders_serial_no_seq; never changes on pin / drag-reorder. Use orders.serial_no, not orders.order_number, for chat / ticket references.';
