-- Add native_languages column to vendors table
-- Stores an array of BCP 47 language codes representing the vendor's native language(s)
-- Most freelance translators have 1 native language; agencies/bilingual vendors may have multiple
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS native_languages jsonb DEFAULT '[]'::jsonb;
