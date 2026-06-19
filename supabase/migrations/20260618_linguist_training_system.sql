-- Linguist training system. Reuses cvp_trainings/cvp_training_lessons (previously
-- staff-only) for vendor/linguist trainings, adds qualification-based targeting,
-- per-training quiz toggle (default OFF for the audit), and a per-vendor completion
-- record (= ISO/IQVIA "employee training file" evidence). Applied to prod via MCP.
-- The 4 starter trainings + lessons (COA Linguistic Validation, GCP for Clinical
-- Linguists, Confidentiality & Data Protection, ISO 17100 Process & QA) were seeded
-- to prod separately and are maintained as content in the DB (staff edit + review).

ALTER TABLE public.cvp_trainings
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS quiz_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applies_to jsonb NOT NULL DEFAULT '{"scope":"universal"}'::jsonb,
  ADD COLUMN IF NOT EXISTS pass_threshold int NOT NULL DEFAULT 80;

CREATE TABLE IF NOT EXISTS public.cvp_training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  training_id uuid NOT NULL REFERENCES public.cvp_trainings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed',
  method text NOT NULL DEFAULT 'online',          -- online | offline (admin-recorded)
  quiz_score numeric,
  completed_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,                                -- staff_users.id for offline records
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, training_id)
);
ALTER TABLE public.cvp_training_completions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.cvp_training_completions TO authenticated, service_role;
DROP POLICY IF EXISTS cvp_tc_read ON public.cvp_training_completions;
CREATE POLICY cvp_tc_read ON public.cvp_training_completions FOR SELECT TO authenticated, anon USING (true);

-- Quiz questions per training — authored now but DORMANT until quiz_enabled flips on
-- (post-audit). Answers stay server-side (service_role only).
CREATE TABLE IF NOT EXISTS public.cvp_training_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.cvp_trainings(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_a text, option_b text, option_c text, option_d text,
  correct_option text NOT NULL,
  explanation text,
  display_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cvp_training_quiz_questions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cvp_training_quiz_questions TO service_role;

-- Trainings visible to a vendor = active linguist trainings that are universal OR
-- whose applies_to.subject_matters intersect the vendor's QMS subject-matter quals.
-- Returns completion status for each. (admin override assign/exempt = future.)
CREATE OR REPLACE FUNCTION public.cvp_linguist_trainings_for_vendor(p_vendor_id uuid)
RETURNS TABLE(training_id uuid, slug text, title text, description text, category text,
              quiz_enabled boolean, lesson_count int, completed boolean, completed_at timestamptz, method text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, qms AS $$
  WITH vsm AS (
    SELECT DISTINCT sm.name
    FROM qms.role_qualifications rq
    JOIN qms.subject_matter_qualifications smq ON smq.role_qualification_id = rq.id
    JOIN qms.subject_matters sm ON sm.id = smq.subject_matter_id
    WHERE rq.vendor_id = p_vendor_id
  )
  SELECT t.id, t.slug, t.title, t.description, t.category, t.quiz_enabled,
         (SELECT count(*)::int FROM public.cvp_training_lessons l WHERE l.training_id = t.id),
         (c.id IS NOT NULL), c.completed_at, c.method
  FROM public.cvp_trainings t
  LEFT JOIN public.cvp_training_completions c ON c.training_id = t.id AND c.vendor_id = p_vendor_id
  WHERE t.is_active AND t.audience = 'linguist'
    AND (
      t.applies_to->>'scope' = 'universal'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(t.applies_to->'subject_matters') smn
        WHERE smn IN (SELECT name FROM vsm)
      )
    )
  ORDER BY t.created_at;
$$;

CREATE OR REPLACE FUNCTION public.cvp_record_training_completion(
  p_vendor_id uuid, p_training_id uuid, p_method text DEFAULT 'online',
  p_quiz_score numeric DEFAULT NULL, p_recorded_by uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.cvp_training_completions (vendor_id, training_id, status, method, quiz_score, recorded_by, notes)
  VALUES (p_vendor_id, p_training_id, 'completed', COALESCE(p_method,'online'), p_quiz_score, p_recorded_by, p_notes)
  ON CONFLICT (vendor_id, training_id) DO UPDATE
    SET status='completed', method=EXCLUDED.method,
        quiz_score=COALESCE(EXCLUDED.quiz_score, public.cvp_training_completions.quiz_score),
        recorded_by=COALESCE(EXCLUDED.recorded_by, public.cvp_training_completions.recorded_by),
        notes=COALESCE(EXCLUDED.notes, public.cvp_training_completions.notes),
        completed_at=now(), updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.cvp_linguist_trainings_for_vendor(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.cvp_record_training_completion(uuid,uuid,text,numeric,uuid,text) TO service_role;
