-- 2026-06-04: allow active staff to SELECT staff_notes directly via
-- PostgREST. The order detail page wires writes through the manage-staff-
-- notes edge function (service_role), but the order LIST page needs a
-- read path to surface the latest note as a row indicator and tooltip.
-- service_role still bypasses RLS as before.

CREATE POLICY staff_notes_staff_select
  ON public.staff_notes
  FOR SELECT
  TO authenticated
  USING (is_active_staff());

COMMENT ON POLICY staff_notes_staff_select ON public.staff_notes IS
  'Active staff (is_active_staff()) can read internal notes. Writes still go through manage-staff-notes edge function (service_role); service_role itself bypasses RLS.';
