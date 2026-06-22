-- 2026-06-22 — Guard the QMS NDA-sync trigger against applicant-only signatures.
--
-- The new pre-vendor NDA clickwrap at assessment access (cvp-applicant-sign-nda)
-- inserts vendor_nda_signatures rows with vendor_id IS NULL when the applicant
-- has no vendor row yet. The AFTER-INSERT trigger qms_tg_sync_nda_signature then
-- called qms_sync_nda_from_signatures(NULL, NULL), which full-scans current NDA
-- signatures and tries to INSERT a NULL vendor_id into qms.nda_agreements
-- (vendor-keyed) — failing the whole signature insert (500 "Failed to record
-- your acceptance"). qms.nda_agreements is vendor-scoped, so applicant-only
-- signatures have nothing to sync until the applicant becomes a vendor.
--
-- Fix: only run the QMS sync when the signature is tied to a vendor. Vendor
-- signature behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.qms_tg_sync_nda_signature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'qms', 'public'
AS $function$
BEGIN
  IF NEW.is_current = true
     AND COALESCE(NEW.agreement_type,'nda') = 'nda'
     AND NEW.vendor_id IS NOT NULL THEN
    PERFORM public.qms_sync_nda_from_signatures(NULL, NEW.vendor_id);
  END IF;
  RETURN NEW;
END $function$;
