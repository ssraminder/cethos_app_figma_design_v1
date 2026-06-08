-- 2026-06-08: Step split — parent + children for multi-vendor on one logical step.
--
-- Today a workflow step has exactly one assignee (vendor_id) or is in-house
-- (actor_type='internal_work', vendor_id IS NULL). Real jobs need to split
-- a single step across multiple parties with per-file scope.
--
-- Model: a logical step becomes a "split parent" (is_split=true). Its
-- partitions live as child rows (parent_step_id=parent.id, partition_index
-- 0..N-1). Each child has its own assignment, vendor_payables, deadline,
-- and a subset of the order's files via the new step_files table. The
-- parent is umbrella only — no vendor, no payable, no offers. Children get
-- appended step_numbers (max+1..max+N) so the existing
-- UNIQUE(workflow_id, step_number) keeps holding without renumbering
-- siblings (which would break approval_depends_on_step references).
--
-- The orders.work_status rollup is extended to ignore child rows
-- (parent_step_id IS NOT NULL) so a split doesn't double-count the slot.
-- A new recompute_parent_step_status function derives the parent's status
-- from its children and is wired into the same status-sync trigger.

-- ------------------------------------------------------------
-- 1. New columns on order_workflow_steps
-- ------------------------------------------------------------
ALTER TABLE public.order_workflow_steps
  ADD COLUMN IF NOT EXISTS parent_step_id uuid
    REFERENCES public.order_workflow_steps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_split boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partition_index integer;

CREATE INDEX IF NOT EXISTS idx_order_workflow_steps_parent_step_id
  ON public.order_workflow_steps (parent_step_id)
  WHERE parent_step_id IS NOT NULL;

-- Child = has parent_step_id AND partition_index together; non-child has neither.
ALTER TABLE public.order_workflow_steps
  ADD CONSTRAINT order_workflow_steps_child_partition_consistency
  CHECK (
    (parent_step_id IS NULL AND partition_index IS NULL)
    OR (parent_step_id IS NOT NULL AND partition_index IS NOT NULL)
  );

-- Children of the same parent have distinct partition_index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_workflow_steps_child_partition
  ON public.order_workflow_steps (parent_step_id, partition_index)
  WHERE parent_step_id IS NOT NULL;

-- A split parent cannot also be a child (no nesting).
ALTER TABLE public.order_workflow_steps
  ADD CONSTRAINT order_workflow_steps_no_nested_split
  CHECK (NOT (is_split AND parent_step_id IS NOT NULL));

COMMENT ON COLUMN public.order_workflow_steps.parent_step_id IS
  'When set, this row is one partition of the referenced parent step. Top-level rows have parent_step_id IS NULL.';
COMMENT ON COLUMN public.order_workflow_steps.is_split IS
  'true on top-level rows that have been split into children. is_split=true parents do not accept vendor assignment, offers, or payables — children carry those.';
COMMENT ON COLUMN public.order_workflow_steps.partition_index IS
  '0-based ordering of children under a parent. NULL for non-children.';

-- ------------------------------------------------------------
-- 2. step_files junction — per-step file scope
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.step_files (
  step_id uuid NOT NULL REFERENCES public.order_workflow_steps(id) ON DELETE CASCADE,
  quote_file_id uuid NOT NULL REFERENCES public.quote_files(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (step_id, quote_file_id)
);

CREATE INDEX IF NOT EXISTS idx_step_files_quote_file_id
  ON public.step_files (quote_file_id);

COMMENT ON TABLE public.step_files IS
  'Per-step file scope. Populated on split-step children to constrain which files a vendor sees. Absent on legacy/unsplit steps (which fall back to quote-wide file listing in vendor-get-job-detail).';

ALTER TABLE public.step_files ENABLE ROW LEVEL SECURITY;

-- Staff (active staff_users) can read + write through edge functions running
-- as authenticated. Service role (used by Netlify functions + most admin
-- edge functions via the SUPABASE_SERVICE_ROLE_KEY) bypasses RLS by default.
CREATE POLICY step_files_staff_all ON public.step_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_users su
      WHERE su.auth_user_id = auth.uid() AND su.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_users su
      WHERE su.auth_user_id = auth.uid() AND su.is_active = true
    )
  );

-- ------------------------------------------------------------
-- 3. Parent step rollup function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_parent_step_status(p_parent_step_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent record;
  v_total int;
  v_approved int;
  v_active int;
  v_delivered int;
  v_new text;
BEGIN
  SELECT id, status, is_split INTO v_parent
    FROM public.order_workflow_steps WHERE id = p_parent_step_id;
  IF v_parent.id IS NULL OR NOT v_parent.is_split THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status != 'cancelled'),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status IN ('offered','assigned','accepted','in_progress','delivered','revision_requested')),
    COUNT(*) FILTER (WHERE status = 'delivered')
  INTO v_total, v_approved, v_active, v_delivered
  FROM public.order_workflow_steps
  WHERE parent_step_id = p_parent_step_id;

  IF v_total = 0 THEN
    v_new := 'pending';
  ELSIF v_approved = v_total THEN
    v_new := 'approved';
  ELSIF v_delivered + v_approved = v_total THEN
    v_new := 'delivered';
  ELSIF v_active > 0 THEN
    v_new := 'in_progress';
  ELSE
    v_new := 'pending';
  END IF;

  IF v_new IS DISTINCT FROM v_parent.status THEN
    UPDATE public.order_workflow_steps
       SET status = v_new, updated_at = now()
     WHERE id = p_parent_step_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.recompute_parent_step_status(uuid) IS
  'Derives a split parent step status from its children. all-approved => approved; all delivered/approved => delivered; any active child => in_progress; else pending. No-ops when the row is not a split parent.';

-- ------------------------------------------------------------
-- 4. Extend the order rollup to ignore split children
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_order_work_status(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current text;
  v_total int;
  v_approved int;
  v_active int;
  v_new text;
BEGIN
  SELECT work_status INTO v_current FROM orders WHERE id = p_order_id;
  IF v_current IS NULL THEN
    RETURN;
  END IF;

  -- Staff intent we never auto-clobber.
  IF v_current IN ('on_hold','cancelled') THEN
    RETURN;
  END IF;

  -- Only count top-level steps; split children are summarised by their parent.
  SELECT
    COUNT(*) FILTER (WHERE status != 'cancelled'),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status IN ('offered','assigned','accepted','in_progress','delivered','revision_requested'))
  INTO v_total, v_approved, v_active
  FROM order_workflow_steps
  WHERE order_id = p_order_id
    AND parent_step_id IS NULL;

  IF v_total = 0 THEN
    v_new := 'pending';
  ELSIF v_approved = v_total THEN
    v_new := 'completed';
  ELSIF v_active > 0 THEN
    v_new := 'in_progress';
  ELSE
    v_new := 'pending';
  END IF;

  IF v_new IS DISTINCT FROM v_current THEN
    UPDATE orders
       SET work_status = v_new,
           updated_at = now()
     WHERE id = p_order_id;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5. Extend the trigger handler to kick parent rollup on child changes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_order_steps_sync_work_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_parent_id := OLD.parent_step_id;
    PERFORM recompute_order_work_status(OLD.order_id);
  ELSE
    v_parent_id := NEW.parent_step_id;
    PERFORM recompute_order_work_status(NEW.order_id);
  END IF;
  IF v_parent_id IS NOT NULL THEN
    PERFORM recompute_parent_step_status(v_parent_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.tg_order_steps_sync_work_status() IS
  'Trigger handler — fires recompute_order_work_status on every change, and recompute_parent_step_status when the changed row is a child.';

-- ------------------------------------------------------------
-- 6. Backfill — recompute every order to pick up the new top-level filter.
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT order_id FROM order_workflow_steps LOOP
    PERFORM recompute_order_work_status(r.order_id);
  END LOOP;
END $$;
