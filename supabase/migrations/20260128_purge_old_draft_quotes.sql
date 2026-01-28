-- Migration: Add automated purge for old draft quotes
-- Description: Deletes draft and incomplete quotes older than 2 weeks

-- Function to purge old draft quotes
CREATE OR REPLACE FUNCTION purge_old_draft_quotes()
RETURNS TABLE(
  deleted_count INTEGER,
  purge_date TIMESTAMP,
  details JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date TIMESTAMP;
  v_deleted_quotes INTEGER := 0;
  v_deleted_files INTEGER := 0;
  v_deleted_analysis INTEGER := 0;
  v_quote_ids UUID[];
BEGIN
  -- Calculate cutoff date (2 weeks ago)
  v_cutoff_date := NOW() - INTERVAL '14 days';
  
  RAISE NOTICE 'Starting purge of draft quotes older than %', v_cutoff_date;
  
  -- Get list of quote IDs to be deleted
  SELECT ARRAY_AGG(id) INTO v_quote_ids
  FROM quotes
  WHERE status IN ('draft', 'details_pending')
    AND created_at < v_cutoff_date
    AND deleted_at IS NULL; -- Only purge non-soft-deleted quotes
  
  IF v_quote_ids IS NULL OR array_length(v_quote_ids, 1) IS NULL THEN
    RAISE NOTICE 'No draft quotes found to purge';
    RETURN QUERY SELECT 
      0 as deleted_count,
      NOW() as purge_date,
      jsonb_build_object(
        'cutoff_date', v_cutoff_date,
        'quotes_deleted', 0,
        'files_deleted', 0,
        'analysis_deleted', 0
      ) as details;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found % draft quotes to purge', array_length(v_quote_ids, 1);
  
  -- Delete related AI analysis results
  DELETE FROM ai_analysis_results
  WHERE quote_id = ANY(v_quote_ids);
  GET DIAGNOSTICS v_deleted_analysis = ROW_COUNT;
  
  -- Delete related quote files
  DELETE FROM quote_files
  WHERE quote_id = ANY(v_quote_ids);
  GET DIAGNOSTICS v_deleted_files = ROW_COUNT;
  
  -- Delete the quotes themselves
  DELETE FROM quotes
  WHERE id = ANY(v_quote_ids);
  GET DIAGNOSTICS v_deleted_quotes = ROW_COUNT;
  
  RAISE NOTICE 'Purge complete: % quotes, % files, % analysis records deleted', 
    v_deleted_quotes, v_deleted_files, v_deleted_analysis;
  
  -- Log the purge operation
  INSERT INTO staff_activity_log (
    staff_id,
    action,
    details,
    created_at
  ) VALUES (
    NULL, -- System action
    'auto_purge_draft_quotes',
    jsonb_build_object(
      'cutoff_date', v_cutoff_date,
      'quotes_deleted', v_deleted_quotes,
      'files_deleted', v_deleted_files,
      'analysis_deleted', v_deleted_analysis,
      'quote_ids', v_quote_ids
    ),
    NOW()
  );
  
  -- Return summary
  RETURN QUERY SELECT 
    v_deleted_quotes as deleted_count,
    NOW() as purge_date,
    jsonb_build_object(
      'cutoff_date', v_cutoff_date,
      'quotes_deleted', v_deleted_quotes,
      'files_deleted', v_deleted_files,
      'analysis_deleted', v_deleted_analysis
    ) as details;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION purge_old_draft_quotes() IS 
'Automatically purges draft and details_pending quotes older than 14 days. Should be called by external cron or Supabase scheduled function.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION purge_old_draft_quotes() TO authenticated, service_role;
