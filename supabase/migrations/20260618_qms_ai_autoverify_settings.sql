-- AI auto-verify policy: a high-confidence, clean AI document screen can verify
-- itself to Tier-2 (no manual step). Config-driven for the audit trail:
--   enabled, threshold %, and the human POLICY OWNER who is accountable for the
--   automated decision (recorded as verified_by on auto-verified evidence).
-- Applied to prod 2026-06-18. Read by the vendor-repo screen-evidence-document
-- helper via qms_ai_autoverify_settings().
INSERT INTO qms.config (key, value, description, iso_clause_reference) VALUES
 ('ai_autoverify_enabled','true'::jsonb,'If true, an AI document screen with confidence >= ai_autoverify_threshold AND a matching holder name AND matching document type AND no concerns is auto-verified to Tier-2 (counts toward qualification). Otherwise it stays Tier-1 screened for human verify.','ISO 17100:2015 §3.1.4'),
 ('ai_autoverify_threshold','90'::jsonb,'Minimum AI confidence (0-100) for auto-verification of a screened document.','ISO 17100:2015 §3.1.4'),
 ('ai_autoverify_policy_owner','"818768c3-64dd-4d86-ae2e-b61528f15ae2"'::jsonb,'auth.users id of the human accountable for the AI auto-verify policy; recorded as verified_by on auto-verified evidence.','ISO 17100:2015 §3.1.4')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.qms_ai_autoverify_settings()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = qms, public AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT (value::text)::boolean FROM qms.config WHERE key='ai_autoverify_enabled'), false),
    'threshold', COALESCE((SELECT (value::text)::int FROM qms.config WHERE key='ai_autoverify_threshold'), 90),
    'policy_owner', (SELECT value #>> '{}' FROM qms.config WHERE key='ai_autoverify_policy_owner')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.qms_ai_autoverify_settings() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qms_ai_autoverify_settings() TO service_role;
