-- Add staff_notes column to quote_files
-- Allows staff to attach notes to uploaded files (visible to customers in emails)
ALTER TABLE quote_files ADD COLUMN IF NOT EXISTS staff_notes TEXT;
