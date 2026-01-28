-- ============================================================================
-- CETHOS: Staff Corrections for HITL Editing
-- Tracks manual corrections to AI analysis with knowledge base integration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Staff Corrections Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES ai_analysis_results(id) ON DELETE CASCADE,
  
  -- What was corrected
  field_name VARCHAR(100) NOT NULL, -- 'language', 'document_type', 'complexity', 'page_count', etc.
  ai_value TEXT, -- Original AI prediction
  corrected_value TEXT NOT NULL, -- Staff's correction
  
  -- Context
  correction_reason TEXT, -- Why it was corrected
  confidence_impact VARCHAR(50), -- 'low_confidence', 'incorrect', 'customer_requested', etc.
  
  -- Knowledge base flag
  submit_to_knowledge_base BOOLEAN DEFAULT FALSE,
  knowledge_base_comment TEXT, -- Staff's note for AI learning
  knowledge_base_submitted_at TIMESTAMPTZ,
  
  -- Metadata
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT valid_field_name CHECK (field_name IN (
    'detected_language',
    'detected_document_type', 
    'assessed_complexity',
    'word_count',
    'page_count',
    'billable_pages',
    'certification_type',
    'line_total',
    'customer_email',
    'customer_phone',
    'customer_full_name',
    'payment_method',
    'shipping_address',
    'billing_address',
    'tax_rate',
    'discount',
    'surcharge',
    'delivery_option'
  ))
);

CREATE INDEX IF NOT EXISTS idx_staff_corrections_quote ON staff_corrections(quote_id);
CREATE INDEX IF NOT EXISTS idx_staff_corrections_analysis ON staff_corrections(analysis_id);
CREATE INDEX IF NOT EXISTS idx_staff_corrections_kb ON staff_corrections(submit_to_knowledge_base) 
  WHERE submit_to_knowledge_base = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_corrections_field ON staff_corrections(field_name);

-- ----------------------------------------------------------------------------
-- 2. Trigger: Auto-submit to Knowledge Base
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_submit_to_knowledge_base()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_document_chars JSONB;
BEGIN
  -- If staff marked for knowledge base submission and hasn't been submitted yet
  IF NEW.submit_to_knowledge_base = TRUE AND NEW.knowledge_base_submitted_at IS NULL THEN
    
    -- Get document characteristics from analysis
    SELECT jsonb_build_object(
      'file_type', mime_type,
      'file_size', file_size,
      'language_detected', detected_language,
      'doc_type_detected', detected_document_type
    ) INTO v_document_chars
    FROM ai_analysis_results ar
    JOIN quote_files qf ON ar.file_id = qf.id
    WHERE ar.id = NEW.analysis_id;
    
    -- Insert into ai_learning_log
    INSERT INTO ai_learning_log (
      learning_type,
      ai_prediction,
      correct_value,
      occurrence_count,
      confidence_score,
      document_characteristics,
      context_notes,
      first_seen_at,
      last_seen_at,
      created_at
    )
    VALUES (
      NEW.field_name,
      NEW.ai_value,
      NEW.corrected_value,
      1,
      NULL, -- Confidence unknown for staff corrections
      v_document_chars,
      NEW.knowledge_base_comment,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (learning_type, ai_prediction, correct_value)
    DO UPDATE SET
      occurrence_count = ai_learning_log.occurrence_count + 1,
      last_seen_at = NOW(),
      context_notes = CASE 
        WHEN ai_learning_log.context_notes IS NULL THEN EXCLUDED.context_notes
        WHEN EXCLUDED.context_notes IS NULL THEN ai_learning_log.context_notes
        ELSE ai_learning_log.context_notes || E'\n---\n' || EXCLUDED.context_notes
      END;
    
    -- Mark as submitted
    NEW.knowledge_base_submitted_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_submit_kb ON staff_corrections;
CREATE TRIGGER trigger_auto_submit_kb
  BEFORE INSERT OR UPDATE ON staff_corrections
  FOR EACH ROW
  EXECUTE FUNCTION auto_submit_to_knowledge_base();

-- ----------------------------------------------------------------------------
-- 3. Function: Get Correction History for a Quote
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_correction_history(p_quote_id UUID)
RETURNS TABLE (
  field_name VARCHAR(100),
  ai_value TEXT,
  corrected_value TEXT,
  corrected_at TIMESTAMPTZ,
  corrected_by_name TEXT,
  reason TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.field_name,
    sc.ai_value,
    sc.corrected_value,
    sc.created_at,
    su.full_name,
    sc.correction_reason
  FROM staff_corrections sc
  JOIN staff_users su ON sc.created_by_staff_id = su.id
  WHERE sc.quote_id = p_quote_id
  ORDER BY sc.created_at DESC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS Policies
-- ----------------------------------------------------------------------------
ALTER TABLE staff_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view corrections" ON staff_corrections;
CREATE POLICY "Staff can view corrections" ON staff_corrections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_users 
      WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can manage corrections" ON staff_corrections;
CREATE POLICY "Staff can manage corrections" ON staff_corrections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Add Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE staff_corrections IS 'Tracks manual corrections made by staff during HITL review with knowledge base integration';
COMMENT ON COLUMN staff_corrections.submit_to_knowledge_base IS 'If true, automatically logs this correction to ai_learning_log for AI improvement';
COMMENT ON COLUMN staff_corrections.knowledge_base_comment IS 'Staff note explaining the correction for AI learning purposes';
COMMENT ON COLUMN staff_corrections.confidence_impact IS 'Categorizes why the correction was needed (low AI confidence, incorrect prediction, customer request, etc.)';

-- ----------------------------------------------------------------------------
-- 6. Grant Permissions
-- ----------------------------------------------------------------------------
GRANT ALL ON staff_corrections TO authenticated;
GRANT EXECUTE ON FUNCTION get_correction_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_submit_to_knowledge_base() TO authenticated;
