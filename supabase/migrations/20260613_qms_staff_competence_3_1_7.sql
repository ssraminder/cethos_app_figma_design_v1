-- §3.1.7 (PM competence) + §3.1.6 (internal reviewers): documented competence
-- for STAFF, who are not vendors. Kept in public (PostgREST does not expose qms)
-- with a qms_ prefix, mirroring the qms_auto_qualification_* tables. Records are
-- never hard-deleted — withdrawn instead. Writes go through the edge function.

CREATE TABLE public.qms_staff_competence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_users(id),
  function_code text NOT NULL CHECK (function_code IN ('project_manager','reviewer','translator','reviser','vendor_manager','qms_admin')),
  iso_clause_reference text,
  basis_kind text NOT NULL CHECK (basis_kind IN ('formal_training','higher_education','on_the_job_training','industry_experience','professional_membership','other')),
  basis_summary text NOT NULL,
  evidence_title text,
  evidence_storage_path text,
  acquired_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  re_review_due date,
  qualified_at timestamptz NOT NULL DEFAULT now(),
  qualified_by uuid REFERENCES public.staff_users(id),
  qualified_by_name text,
  withdrawn_at timestamptz,
  withdrawn_by uuid REFERENCES public.staff_users(id),
  withdrawn_reason text,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qms_staff_competence_staff ON public.qms_staff_competence(staff_id) WHERE status = 'active';

ALTER TABLE public.qms_staff_competence ENABLE ROW LEVEL SECURITY;
-- No policies: service-role-only via the manage-staff-competence edge function.
GRANT ALL ON public.qms_staff_competence TO service_role;
