-- ============================================================================
-- Migration: vendor_additional_emails
-- Date: 2026-05-08
-- Adds optional secondary email addresses to vendors. The primary email
-- column is unchanged; additional_emails is a text[] of cc/bcc-eligible
-- recipients that get fanned into vendor assignment notifications.
-- Applied directly to prod via MCP apply_migration.
-- ============================================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS additional_emails text[]
    NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN vendors.additional_emails IS
  'Optional CC recipients for vendor notifications (assignment, offer, instructions). The primary email column is the To: address.';
