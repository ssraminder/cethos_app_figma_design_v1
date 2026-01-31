-- Create file_categories table for categorizing uploaded files in manual quotes
CREATE TABLE IF NOT EXISTS file_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                      -- "To Translate"
  slug TEXT NOT NULL UNIQUE,               -- "to_translate"
  description TEXT,                        -- "Documents requiring translation"
  is_billable BOOLEAN DEFAULT false,       -- Only billable files get priced
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_file_categories_display_order ON file_categories(display_order);

-- Create index for active categories
CREATE INDEX IF NOT EXISTS idx_file_categories_is_active ON file_categories(is_active);

-- Add comment on table
COMMENT ON TABLE file_categories IS 'Categories for uploaded files in manual quote workflows';

-- Add comments on columns
COMMENT ON COLUMN file_categories.name IS 'Display name of the category';
COMMENT ON COLUMN file_categories.slug IS 'URL-safe unique identifier';
COMMENT ON COLUMN file_categories.description IS 'Optional description of the category';
COMMENT ON COLUMN file_categories.is_billable IS 'Whether files in this category should be priced and analyzed';
COMMENT ON COLUMN file_categories.display_order IS 'Order in which categories appear in dropdowns';
COMMENT ON COLUMN file_categories.is_active IS 'Whether category is visible in dropdowns';

-- Insert default categories
INSERT INTO file_categories (name, slug, description, is_billable, display_order, is_active) VALUES
  ('To Translate', 'to_translate', 'Documents requiring certified translation', true, 1, true),
  ('Reference', 'reference', 'Supporting context material for translators', false, 2, true),
  ('Source', 'source', 'Original source files', false, 3, true),
  ('Glossary', 'glossary', 'Terminology lists and definitions', false, 4, true),
  ('Style Guide', 'style_guide', 'Client style preferences and guidelines', false, 5, true),
  ('Final Deliverable', 'final_deliverable', 'Completed translation output', false, 6, true)
ON CONFLICT (slug) DO NOTHING;

-- Add file_category_id column to quote_files if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_files' AND column_name = 'file_category_id'
  ) THEN
    ALTER TABLE quote_files ADD COLUMN file_category_id UUID REFERENCES file_categories(id);
    COMMENT ON COLUMN quote_files.file_category_id IS 'Category of the uploaded file';
  END IF;
END $$;

-- Create updated_at trigger for file_categories
CREATE OR REPLACE FUNCTION update_file_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS file_categories_updated_at ON file_categories;
CREATE TRIGGER file_categories_updated_at
  BEFORE UPDATE ON file_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_file_categories_updated_at();

-- Enable RLS
ALTER TABLE file_categories ENABLE ROW LEVEL SECURITY;

-- Create policies for file_categories (allow all for authenticated users - admin only)
CREATE POLICY "Allow read access to file_categories" ON file_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users" ON file_categories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users" ON file_categories
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users" ON file_categories
  FOR DELETE TO authenticated USING (true);
