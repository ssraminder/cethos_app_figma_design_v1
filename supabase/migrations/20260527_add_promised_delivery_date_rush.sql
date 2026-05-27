-- ============================================================================
-- 20260527_add_promised_delivery_date_rush.sql
--
-- Manual quotes today carry a single `promised_delivery_date`. The customer
-- review page (Step4ReviewCheckout) computes both standard and rush delivery
-- dates from today + N business days and ignores the admin-set value, so a
-- staff-set delivery date of 2026-07-06 is invisible to the customer who
-- sees a freshly-computed "Ready by …" instead.
--
-- Add a second column so manual quotes can carry both dates. The customer
-- view prefers these values over its computed default when present;
-- non-manual quotes (regular customer flow) leave both columns NULL and
-- behaviour is unchanged.
-- ============================================================================

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS promised_delivery_date_rush DATE NULL;

COMMENT ON COLUMN quotes.promised_delivery_date IS
  'Standard delivery date the customer sees on the quote review page. Used by manual quotes; auto quotes leave NULL and the customer view computes from today + business days.';
COMMENT ON COLUMN quotes.promised_delivery_date_rush IS
  'Rush delivery date the customer sees on the quote review page when they toggle to the rush option. Used by manual quotes; auto quotes leave NULL.';
