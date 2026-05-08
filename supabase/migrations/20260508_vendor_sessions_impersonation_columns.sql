-- ============================================================================
-- Migration: vendor_sessions_impersonation_columns
-- Date: 2026-05-08
-- Adds is_impersonation + impersonator_staff_id to vendor_sessions so the
-- admin "View as vendor" flow can mint short-lived sessions tagged with
-- the staff user who started them. The vendor portal renders a yellow
-- impersonation banner with "Exit" when is_impersonation = true.
-- Applied directly to prod via MCP apply_migration.
-- ============================================================================

ALTER TABLE vendor_sessions
  ADD COLUMN IF NOT EXISTS is_impersonation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impersonator_staff_id uuid REFERENCES staff_users(id);

CREATE INDEX IF NOT EXISTS vendor_sessions_impersonation_idx
  ON vendor_sessions (impersonator_staff_id, created_at DESC)
  WHERE is_impersonation = true;

COMMENT ON COLUMN vendor_sessions.is_impersonation IS
  'True if this session was minted by a staff user via admin-impersonate-vendor. Vendor portal shows an impersonation banner when this is true.';
COMMENT ON COLUMN vendor_sessions.impersonator_staff_id IS
  'When is_impersonation=true, the staff_users.id of the impersonator. Used for audit and to display "impersonating" banner.';
