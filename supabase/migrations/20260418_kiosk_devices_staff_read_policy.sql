-- ============================================================================
-- Kiosk: let authenticated staff read + update kiosk_devices
--
-- The initial migration locked kiosk_devices to service-role-only, which
-- meant the admin portal's Kiosk Devices page (using the anon/auth client)
-- saw zero rows. Mirror the pattern used on staff_users: anyone with a
-- valid staff row can SELECT and UPDATE (for revoke). Service role still
-- has full access via the original policy.
-- ============================================================================

CREATE POLICY "kiosk_devices_select_staff" ON kiosk_devices
  FOR SELECT
  USING (is_staff_user());

CREATE POLICY "kiosk_devices_update_staff" ON kiosk_devices
  FOR UPDATE
  USING (is_staff_user())
  WITH CHECK (is_staff_user());
