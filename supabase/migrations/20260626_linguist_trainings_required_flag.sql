-- Phase 2b: vendor training visibility = auto-match (universal / subject-matter)
-- PLUS explicit admin assignments, with a `required` flag for assigned trainings.
-- Applied via MCP. Signature change (added `required`) requires DROP first.
DROP FUNCTION IF EXISTS public.cvp_linguist_trainings_for_vendor(uuid);
CREATE OR REPLACE FUNCTION public.cvp_linguist_trainings_for_vendor(p_vendor_id uuid)
 RETURNS TABLE(training_id uuid, slug text, title text, description text, category text, quiz_enabled boolean, lesson_count integer, completed boolean, completed_at timestamp with time zone, method text, required boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'qms'
AS $function$
  WITH vsm AS (
    SELECT DISTINCT sm.name
    FROM qms.role_qualifications rq
    JOIN qms.subject_matter_qualifications smq ON smq.role_qualification_id = rq.id
    JOIN qms.subject_matters sm ON sm.id = smq.subject_matter_id
    WHERE rq.vendor_id = p_vendor_id
  ),
  assigned AS (
    SELECT DISTINCT training_id FROM public.cvp_training_assignments WHERE vendor_id = p_vendor_id
  )
  SELECT t.id, t.slug, t.title, t.description, t.category, t.quiz_enabled,
         (SELECT count(*)::int FROM public.cvp_training_lessons l WHERE l.training_id = t.id),
         (c.id IS NOT NULL), c.completed_at, c.method,
         (a.training_id IS NOT NULL)
  FROM public.cvp_trainings t
  LEFT JOIN public.cvp_training_completions c ON c.training_id = t.id AND c.vendor_id = p_vendor_id
  LEFT JOIN assigned a ON a.training_id = t.id
  WHERE t.is_active AND t.audience = 'linguist'
    AND (
      a.training_id IS NOT NULL
      OR t.applies_to->>'scope' = 'universal'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(t.applies_to->'subject_matters') smn
        WHERE smn IN (SELECT name FROM vsm)
      )
    )
  ORDER BY (a.training_id IS NOT NULL) DESC, t.created_at;
$function$;
GRANT EXECUTE ON FUNCTION public.cvp_linguist_trainings_for_vendor(uuid) TO service_role;
