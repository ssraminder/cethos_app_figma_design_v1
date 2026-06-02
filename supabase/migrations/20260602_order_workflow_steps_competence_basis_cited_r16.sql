-- R16: ISO 17100 §6.1.2 — record which qualification was cited at
-- assignment time. NULLable today; Stage 2 audit will flip to NOT NULL
-- after R14 backfill UI lands.

ALTER TABLE public.order_workflow_steps
  ADD COLUMN IF NOT EXISTS competence_basis_cited_id uuid
    REFERENCES qms.role_qualifications(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_workflow_steps.competence_basis_cited_id IS
  'R16 — the qms.role_qualifications row the PM cited when assigning this step. NULL = not yet captured. Stage 2 audit will require this populated for new assignments.';

CREATE INDEX IF NOT EXISTS order_workflow_steps_competence_basis_cited_idx
  ON public.order_workflow_steps(competence_basis_cited_id)
  WHERE competence_basis_cited_id IS NOT NULL;
