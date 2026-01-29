-- Add ai_processing_status column to quote_files table for tracking AI processing
ALTER TABLE quote_files 
ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(20) DEFAULT 'skipped' 
CHECK (ai_processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- Add comment
COMMENT ON COLUMN quote_files.ai_processing_status IS 'Status of AI processing for this file: pending, processing, completed, failed, or skipped';

-- Update existing rows to have 'skipped' status
UPDATE quote_files 
SET ai_processing_status = 'skipped' 
WHERE ai_processing_status IS NULL;
