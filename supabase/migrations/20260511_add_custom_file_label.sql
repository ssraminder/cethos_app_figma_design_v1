-- Adds a 'custom' file category and a custom_label column on quote_files
-- so staff can attach a user-provided label (e.g., "Vendor brief",
-- "Style sample") when none of the standard categories fit.

INSERT INTO file_categories (name, slug, description, is_billable, display_order, is_active)
VALUES (
  'Custom',
  'custom',
  'User-provided custom label for file type',
  false,
  9,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true;

ALTER TABLE quote_files
  ADD COLUMN IF NOT EXISTS custom_label TEXT;
