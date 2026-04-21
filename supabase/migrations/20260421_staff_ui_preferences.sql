-- ============================================================================
-- Per-staff UI preferences — orders-list filter defaults, view mode, etc.
-- jsonb keeps the schema flexible; initial use is AdminOrdersList.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='staff_users' AND column_name='ui_preferences'
  ) THEN
    ALTER TABLE staff_users
      ADD COLUMN ui_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
