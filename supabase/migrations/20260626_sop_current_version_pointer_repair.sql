-- 20260626_sop_current_version_pointer_repair.sql
-- SOP-008/009/019/028 each had a newer version activated (status='active') via prior
-- direct SQL, but sops.current_version_id was never moved off the older superseded
-- version. Result: /admin/sops rendered the SUPERSEDED content — including the COA
-- audit-gate SOP-019, which showed its pre-correction v2 instead of the v3 with the
-- corrected cross-references. This repoints each SOP at its existing active version.
-- It changes NO version content and NO approval metadata — pointer correction only.
WITH active_v AS (
  SELECT s.id AS sop_id, sv.id AS version_id
  FROM public.sops s
  JOIN public.sop_versions sv ON sv.sop_id = s.id AND sv.status = 'active'
  WHERE s.sop_number IN ('SOP-008','SOP-009','SOP-019','SOP-028')
)
UPDATE public.sops s
SET current_version_id = active_v.version_id, updated_at = now()
FROM active_v
WHERE s.id = active_v.sop_id
  AND s.current_version_id IS DISTINCT FROM active_v.version_id;
