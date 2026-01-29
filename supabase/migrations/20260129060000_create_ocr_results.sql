-- Create table for storing raw OCR results with per-page breakdown
CREATE TABLE IF NOT EXISTS ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_file_id UUID NOT NULL REFERENCES quote_files(id) ON DELETE CASCADE,
  ocr_provider TEXT NOT NULL, -- google_document_ai, aws_textract, azure_form_recognizer, mistral
  total_pages INTEGER NOT NULL DEFAULT 1,
  total_words INTEGER NOT NULL DEFAULT 0,
  pages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {page_number, text, word_count}
  raw_response JSONB, -- Full OCR provider response for debugging
  confidence_score NUMERIC(5,2),
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups by quote_file_id
CREATE INDEX IF NOT EXISTS idx_ocr_results_quote_file ON ocr_results(quote_file_id);

-- Create index for provider-based queries
CREATE INDEX IF NOT EXISTS idx_ocr_results_provider ON ocr_results(ocr_provider);

-- Add RLS policies
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all OCR results
CREATE POLICY "Allow authenticated users to read OCR results"
  ON ocr_results FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to manage OCR results
CREATE POLICY "Allow service role to manage OCR results"
  ON ocr_results FOR ALL
  TO service_role
  USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ocr_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ocr_results_updated_at
  BEFORE UPDATE ON ocr_results
  FOR EACH ROW
  EXECUTE FUNCTION update_ocr_results_updated_at();

-- Add comment
COMMENT ON TABLE ocr_results IS 'Stores raw OCR results with per-page word counts for document analysis';
