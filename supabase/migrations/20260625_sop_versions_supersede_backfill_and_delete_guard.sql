-- Two document-control fixes surfaced by the SOP-001 (Document Control &
-- Records Management) e2e validation on 2026-06-25:
--
--  (1) ISS-01 — superseded SOP versions kept status='active'. The manage-sops
--      `activate` path already supersedes the prior version, but 10 SOPs were
--      seeded directly (both v1 and v2 stamped active) so their v1 never got
--      superseded. Backfill: any active version that is not its SOP's current
--      version becomes 'superseded'. The version-history UI already renders
--      'superseded' as a distinct grey chip, so no UI change is needed.
--      Affected: SOP-003, 008, 009, 011, 016, 017, 018, 019, 020, 021 (v1 each).
--
--  (2) ISS-02 — SOP-001 §5 says approved versions are protected from "editing
--      OR deleting", but sop_versions only had an UPDATE immutability trigger
--      (sop_versions_immutable). Add a BEFORE DELETE guard so recorded
--      (non-draft) versions cannot be deleted; drafts remain freely discardable.

-- (1) Backfill: supersede non-current active versions ------------------------
UPDATE public.sop_versions v
SET status = 'superseded'
FROM public.sops s
WHERE s.id = v.sop_id
  AND v.status = 'active'
  AND v.id <> s.current_version_id;

-- (2) Delete guard for recorded (non-draft) versions ------------------------
CREATE OR REPLACE FUNCTION public.sop_versions_no_delete_recorded()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'SOP version cannot be deleted once recorded (status=%) — supersede or retire instead', OLD.status
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sop_versions_no_delete ON public.sop_versions;
CREATE TRIGGER trg_sop_versions_no_delete
  BEFORE DELETE ON public.sop_versions
  FOR EACH ROW EXECUTE FUNCTION public.sop_versions_no_delete_recorded();
