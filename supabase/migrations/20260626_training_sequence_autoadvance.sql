-- Auto-advancing general-training pathway: on completion of a sequence training,
-- the next-higher-order one is auto-assigned + emailed (one step at a time, stops
-- at the end). Backed by the advance-training-sequence edge function, fired by a
-- completion trigger (immediate) + a 15-min pg_cron sweep (self-healing).

-- 1) sequence position on trainings (NULL = not in the auto-pathway)
ALTER TABLE public.cvp_trainings ADD COLUMN IF NOT EXISTS sequence_order integer;
COMMENT ON COLUMN public.cvp_trainings.sequence_order IS
  'Position in the auto-advance general-training pathway (NULL = not in sequence). On completion, the next-higher-order active linguist training is auto-assigned + emailed by advance-training-sequence.';

-- 2) the 3 general trainings, in order (subject-level trainings stay NULL = paused)
UPDATE public.cvp_trainings SET sequence_order = 1 WHERE id = 'c5fd6186-5cf4-4eea-a1de-d3c2e803741c'; -- Confidentiality & Data Protection
UPDATE public.cvp_trainings SET sequence_order = 2 WHERE id = 'b2aead87-ddcd-4f9b-8d4a-b4b1d82e44e4'; -- ISO 17100 Process & QA
UPDATE public.cvp_trainings SET sequence_order = 3 WHERE id = '3534f683-243e-48b8-99b4-9734d3e978b7'; -- Secure File Handling

-- 3) advance fn: assign each in-scope active vendor's next uncompleted sequence
--    step; RETURNS ONLY rows newly assigned now (so the caller emails each once).
--    `#variable_conflict use_column` resolves the OUT-param vs column name clash
--    (vendor_id/training_id) in the ON CONFLICT / RETURNING clauses.
CREATE OR REPLACE FUNCTION public.cvp_advance_training_sequence(p_vendor_id uuid DEFAULT NULL)
RETURNS TABLE(vendor_id uuid, training_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH seq AS (
    SELECT id, sequence_order FROM public.cvp_trainings
    WHERE is_active AND audience = 'linguist' AND sequence_order IS NOT NULL
  ),
  va AS (
    SELECT id FROM public.vendors
    WHERE status = 'active' AND email IS NOT NULL
      AND (p_vendor_id IS NULL OR id = p_vendor_id)
  ),
  next_ord AS (
    SELECT v.id AS vid, MIN(s.sequence_order) AS ord
    FROM va v CROSS JOIN seq s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cvp_training_completions c
      WHERE c.vendor_id = v.id AND c.training_id = s.id AND c.status = 'completed'
    )
    GROUP BY v.id
  ),
  targets AS (
    SELECT n.vid AS v_id, s.id AS t_id
    FROM next_ord n JOIN seq s ON s.sequence_order = n.ord
  ),
  ins AS (
    INSERT INTO public.cvp_training_assignments (training_id, vendor_id, assigned_by)
    SELECT t.t_id, t.v_id, NULL FROM targets t
    ON CONFLICT (training_id, vendor_id) WHERE vendor_id IS NOT NULL DO NOTHING
    RETURNING vendor_id AS vid, training_id AS tid
  )
  SELECT ins.vid, ins.tid FROM ins;
END
$fn$;

-- 4) trigger: on a NEW completion, ping the edge fn to advance that vendor
CREATE OR REPLACE FUNCTION public.cvp_trg_advance_on_completion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'net'
AS $fn$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM net.http_post(
      url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/advance-training-sequence',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c',
        'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c'
      ),
      body := jsonb_build_object('vendor_id', NEW.vendor_id, 'completed_training_id', NEW.training_id)
    );
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_advance_on_completion ON public.cvp_training_completions;
CREATE TRIGGER trg_advance_on_completion
AFTER INSERT ON public.cvp_training_completions
FOR EACH ROW EXECUTE FUNCTION public.cvp_trg_advance_on_completion();

-- 5) cron backstop every 15 min (self-healing sweep)
DO $do$
BEGIN
  PERFORM cron.unschedule('advance-training-sequence-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END
$do$;

SELECT cron.schedule('advance-training-sequence-sweep', '*/15 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/advance-training-sequence',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c'
    ),
    body := '{}'::jsonb
  );
$cron$);
