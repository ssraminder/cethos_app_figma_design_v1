-- R14 followup — PostgREST exposes only public/graphql_public/tr, so the
-- admin VendorQmsTab's `supabase.schema('qms')` lookups (competence_bases,
-- evidence_types) returned empty and the dropdowns were unusable. Expose the
-- enum-like reference tables via read-only public views so the UI can
-- populate the modal without a PostgREST schema-config change.

CREATE OR REPLACE VIEW public.qms_competence_bases AS
  SELECT id, code, role_type_code, short_label, description, iso_clause_reference
  FROM qms.competence_bases;

CREATE OR REPLACE VIEW public.qms_evidence_types AS
  SELECT id, code, name, applies_to_roles, description, iso_clause_reference
  FROM qms.evidence_types;

CREATE OR REPLACE VIEW public.qms_role_types AS
  SELECT id, code, name, description, iso_clause_reference
  FROM qms.role_types;

GRANT SELECT ON public.qms_competence_bases TO authenticated, anon, service_role;
GRANT SELECT ON public.qms_evidence_types  TO authenticated, anon, service_role;
GRANT SELECT ON public.qms_role_types      TO authenticated, anon, service_role;

COMMENT ON VIEW public.qms_competence_bases IS
  'R14 followup — read-only window onto qms.competence_bases so VendorQmsTab can populate its dropdown via PostgREST without exposing the whole qms schema.';
