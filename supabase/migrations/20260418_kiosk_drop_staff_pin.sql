-- ============================================================================
-- Kiosk: drop unused staff kiosk PIN columns
--
-- Switched to paired-device-only auth (no per-staff PIN unlock). The
-- set-staff-kiosk-pin and kiosk-staff-unlock edge functions are deleted;
-- no code reads these columns anymore.
-- ============================================================================

ALTER TABLE staff_users
  DROP COLUMN IF EXISTS kiosk_pin_hash,
  DROP COLUMN IF EXISTS kiosk_pin_set_at;
