-- 2026-06-04: Admin order list pin/reorder + deadline backfill
--
-- 1) orders.pinned_position lets staff pin specific orders to the top of the
--    admin /orders list. NULL = not pinned (default sort by created_at). Lower
--    value = higher in list. Used by Pin / Unpin / Move up / Move down actions
--    in AdminOrdersList row menu. No UNIQUE constraint so adjacent swaps stay
--    a two-statement UPDATE, with stable tie-break on created_at DESC.
--
-- 2) Backfill: 71 in-flight orders carry estimated_delivery_date but no
--    estimated_delivery_at, so the order-list "Client Deadline" column drops
--    down to date-only render. Populate the timestamp at 17:00 America/Edmonton
--    on the deadline date (COB) so the existing date+time render lights up
--    uniformly. Future order-creation paths should set both fields directly.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pinned_position INTEGER;

CREATE INDEX IF NOT EXISTS orders_pinned_position_idx
  ON orders (pinned_position)
  WHERE pinned_position IS NOT NULL;

COMMENT ON COLUMN orders.pinned_position IS
  'Staff-managed pin order: NULL = not pinned (sort by created_at). Non-NULL pinned rows render at the top of the admin /orders list ordered by pinned_position ASC (lower = higher in list). Set/unset via row menu Pin/Unpin + Move up/down actions in AdminOrdersList.';

UPDATE orders
SET estimated_delivery_at = (estimated_delivery_date::timestamp + interval '17 hours') AT TIME ZONE 'America/Edmonton'
WHERE estimated_delivery_at IS NULL
  AND estimated_delivery_date IS NOT NULL;
