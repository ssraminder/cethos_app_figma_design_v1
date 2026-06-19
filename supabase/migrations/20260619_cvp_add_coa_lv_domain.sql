-- Add 'coa_linguistic_validation' to the domain CHECK constraints so the apply
-- form's new "COA / Linguistic Validation" domain (lib/domains.ts in the
-- recruitment app) can be submitted into cvp_test_combinations / cvp_test_library.
-- Applied to prod via MCP 2026-06-19.
ALTER TABLE public.cvp_test_library DROP CONSTRAINT cvp_test_library_domain_check;
ALTER TABLE public.cvp_test_library ADD CONSTRAINT cvp_test_library_domain_check
  CHECK (domain::text = ANY (ARRAY['legal','certified_official','immigration','medical','life_sciences','coa_linguistic_validation','pharmaceutical','financial','insurance','technical','it_software','automotive_engineering','energy','marketing_advertising','literary_publishing','academic_scientific','government_public','business_corporate','gaming_entertainment','media_journalism','tourism_hospitality','general','other']::text[]));

ALTER TABLE public.cvp_test_combinations DROP CONSTRAINT cvp_test_combinations_domain_check;
ALTER TABLE public.cvp_test_combinations ADD CONSTRAINT cvp_test_combinations_domain_check
  CHECK (domain::text = ANY (ARRAY['legal','certified_official','immigration','medical','life_sciences','coa_linguistic_validation','pharmaceutical','financial','insurance','technical','it_software','automotive_engineering','energy','marketing_advertising','literary_publishing','academic_scientific','government_public','business_corporate','gaming_entertainment','media_journalism','tourism_hospitality','general','other']::text[]));

-- Map the new COA/LV domain to the Clinical Trials subject-matter for QMS qualification.
CREATE OR REPLACE FUNCTION public.qms_map_domain_to_subject_matter(p_domain text)
 RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path TO 'qms', 'public'
AS $function$
  SELECT sm.id FROM qms.subject_matters sm WHERE sm.name = CASE lower(p_domain)
    WHEN 'legal' THEN 'Legal'
    WHEN 'medical' THEN 'Life Sciences / Medical'
    WHEN 'life_sciences' THEN 'Life Sciences / Medical'
    WHEN 'coa_linguistic_validation' THEN 'Clinical Trials (ICF, COA, COG)'
    WHEN 'pharmaceutical' THEN 'Pharmaceutical'
    WHEN 'financial' THEN 'Finance / Banking'
    WHEN 'insurance' THEN 'Finance / Banking'
    WHEN 'technical' THEN 'Technical'
    WHEN 'it_software' THEN 'Software / IT / Localization'
    WHEN 'it___software' THEN 'Software / IT / Localization'
    WHEN 'automotive_engineering' THEN 'Engineering / Manufacturing'
    WHEN 'marketing_advertising' THEN 'Marketing / Transcreation'
    WHEN 'government_public' THEN 'Government / Public Sector'
    WHEN 'business_corporate' THEN 'General Business'
    WHEN 'general' THEN 'General Business'
    WHEN 'immigration' THEN 'Immigration'
    WHEN 'energy' THEN 'Oil & Gas / Energy'
    WHEN 'academic_scientific' THEN 'Education'
    WHEN 'certified_official' THEN 'Certified Translation (legal documents)'
    ELSE NULL END
  LIMIT 1;
$function$;
