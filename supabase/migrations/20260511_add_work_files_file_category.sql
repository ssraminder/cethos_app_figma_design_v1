-- Adds "Files to Work Upon" file category for working/translation files
-- (bilingual files, in-progress translations the vendor edits directly).
-- Idempotent: ON CONFLICT updates name/description and re-activates.

INSERT INTO file_categories (name, slug, description, is_billable, display_order, is_active)
VALUES (
  'Files to Work Upon',
  'work_files',
  'Working files for the vendor to edit/translate (bilingual files, in-progress translations, etc.)',
  false,
  8,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true;
