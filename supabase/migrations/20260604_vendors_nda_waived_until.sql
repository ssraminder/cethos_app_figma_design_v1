-- 2026-06-04: time-boxed NDA bypass for vendors whose new NDA is in flight.
--
-- When the legal team is renegotiating an NDA template and a vendor has an
-- older signature that's still effectively in force, staff can set
-- nda_waived_until to a future timestamp so the onboarding gate stops
-- blocking the vendor from logging in / picking up jobs. After that
-- timestamp passes, the gate re-engages — no manual cleanup needed.
--
-- Read-side check (vendor portal onboarding gate):
--   passes = (nda_signed_at IS NOT NULL AND nda_template_id = current_template)
--            OR (nda_waived_until IS NOT NULL AND nda_waived_until > now())
--
-- Write side stays unchanged — sign-nda still writes nda_signed_at +
-- nda_template_id on actual signature.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS nda_waived_until TIMESTAMPTZ;

COMMENT ON COLUMN vendors.nda_waived_until IS
  'Staff-set time-boxed bypass for the NDA onboarding gate. When > now(), the vendor portal onboarding gate treats the vendor as if NDA is current. Lets the legal team renegotiate the template without locking the vendor out of work in the interim. NULL = no waiver, gate behaves normally.';

CREATE INDEX IF NOT EXISTS vendors_nda_waived_until_active_idx
  ON vendors (nda_waived_until)
  WHERE nda_waived_until IS NOT NULL;
