-- ============================================================================
-- CETHOS: Kiosk-mode tablet pairing infrastructure
-- Date: April 18, 2026
--
-- Enables office tablets to run the fast-quote form without a full staff
-- login. A tablet is paired once as a *device* (its own credential), and
-- staff authorize each transaction with a short PIN. Quotes/orders created
-- via this path are tagged with the originating kiosk_device_id.
-- ============================================================================

-- 1. Paired devices
CREATE TABLE IF NOT EXISTS kiosk_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  device_secret_hash TEXT NOT NULL,
  default_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kiosk_devices_active
  ON kiosk_devices(is_active) WHERE is_active;

-- 2. One-time pairing codes (6-char alphanum, 15-min TTL)
CREATE TABLE IF NOT EXISTS kiosk_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  device_id UUID NOT NULL REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_pairing_codes_expires
  ON kiosk_pairing_codes(expires_at);

-- 3. Staff numeric PIN for kiosk handoff unlock (separate from full login)
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS kiosk_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS kiosk_pin_set_at TIMESTAMPTZ;

-- 4. Tag quotes/orders that came from kiosk
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS kiosk_device_id UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kiosk_device_id UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL;

-- 5. RLS — service role only (edge functions own these tables)
ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on kiosk_devices" ON kiosk_devices
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on kiosk_pairing_codes" ON kiosk_pairing_codes
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'kiosk_devices' AS table_name, COUNT(*) AS columns
FROM information_schema.columns
WHERE table_name = 'kiosk_devices' AND table_schema = 'public';

SELECT 'kiosk_pairing_codes' AS table_name, COUNT(*) AS columns
FROM information_schema.columns
WHERE table_name = 'kiosk_pairing_codes' AND table_schema = 'public';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'staff_users' AND column_name IN ('kiosk_pin_hash', 'kiosk_pin_set_at');

SELECT column_name FROM information_schema.columns
WHERE table_name IN ('quotes', 'orders') AND column_name = 'kiosk_device_id';
