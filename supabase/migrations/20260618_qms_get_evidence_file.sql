-- Resolve a competence_evidence row's stored file so the admin
-- qms-evidence-download edge function can mint a signed download URL
-- (qms schema isn't exposed to PostgREST). Applied to prod 2026-06-18.
CREATE OR REPLACE FUNCTION public.qms_get_evidence_file(p_evidence_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = qms, public AS $$
  SELECT jsonb_build_object(
    'id', ce.id,
    'vendor_id', ce.vendor_id,
    'storage_path', ce.storage_path,
    'file_name', ce.file_name,
    'file_mime', ce.file_mime,
    'title', ce.title
  )
  FROM qms.competence_evidence ce
  WHERE ce.id = p_evidence_id;
$$;

REVOKE EXECUTE ON FUNCTION public.qms_get_evidence_file(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_get_evidence_file(uuid) TO service_role;
