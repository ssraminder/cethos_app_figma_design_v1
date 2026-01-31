-- ============================================================================
-- ADD manual_filename COLUMN TO ai_analysis_results
-- Migration: 20260131_add_manual_filename_to_analysis.sql
-- ============================================================================

-- Add column for manual entries without files
-- This stores the document name when there's no uploaded file
-- Example: "Birth Certificate - Maria Garcia"
ALTER TABLE ai_analysis_results
ADD COLUMN IF NOT EXISTS manual_filename TEXT;

-- Add column for custom document type when "Other" is selected
ALTER TABLE ai_analysis_results
ADD COLUMN IF NOT EXISTS document_type_other TEXT;

-- Add column to track if entry was staff-created
ALTER TABLE ai_analysis_results
ADD COLUMN IF NOT EXISTS is_staff_created BOOLEAN DEFAULT false;

-- Add column to track which staff member created the entry
ALTER TABLE ai_analysis_results
ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES staff_users(id);

-- Comments
COMMENT ON COLUMN ai_analysis_results.manual_filename IS 'Document name for manual entries without an uploaded file';
COMMENT ON COLUMN ai_analysis_results.document_type_other IS 'Custom document type text when "Other" is selected';
COMMENT ON COLUMN ai_analysis_results.is_staff_created IS 'Whether this entry was manually created by staff';
COMMENT ON COLUMN ai_analysis_results.created_by_staff_id IS 'Staff user who created this manual entry';
