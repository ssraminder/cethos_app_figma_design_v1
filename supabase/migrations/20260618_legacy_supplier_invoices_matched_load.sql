-- Pre-XTRF supplier invoice history (2022-2023), aggregated per supplier and
-- matched to vendors. Source: user-provided 'SUPPLIER INVOICES 2023 OLD.xlsx' +
-- 'supplier_invoices 2022.xlsx' (5,398 invoices / 219 suppliers; 100 matched a
-- vendor). This migration loads the 10 matched suppliers that already have QMS
-- role-qualification records, as input to qms_build_first_party_experience.
-- (The 90 matched suppliers with NO qualification record — the legacy roster —
-- are a separate decision: they need qualification records created, not just
-- evidence. Tracked for a follow-up.) Applied to prod via MCP 2026-06-18.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE TABLE IF NOT EXISTS public.legacy_supplier_invoice_summary (
  supplier_name_raw text, supplier_name_norm text, n_invoices int,
  earliest date, latest date, total_cad numeric, currencies text[], pairs text[], vendor_id uuid);
COMMENT ON TABLE public.legacy_supplier_invoice_summary IS
  'Pre-XTRF supplier invoice history 2022-2023 (user-provided xlsx), aggregated per supplier and matched to vendors. Input to qms_build_first_party_experience.';

INSERT INTO public.legacy_supplier_invoice_summary
 (supplier_name_raw,supplier_name_norm,n_invoices,earliest,latest,total_cad,currencies,vendor_id) VALUES
('Abhinav Dang','abhinav dang',505,'2022-02-10','2023-10-12',7291.30,ARRAY['CAD'],'f01458a7-4b91-4009-aed8-1320e324b752'),
('Anh Doan','anh doan',17,'2022-11-03','2022-12-20',408.68,ARRAY['CAD'],'a314047a-0f41-421c-9718-af00e25b886a'),
('Brijesh Naik','brijesh naik',30,'2022-01-22','2022-01-22',784.60,ARRAY['CAD'],'ebddc3b4-d798-417b-bb4d-fc6f2f7745d3'),
('Camilla Virtanen','camilla virtanen',18,'2022-06-14','2023-07-03',1039.16,ARRAY['CAD'],'d60c57aa-8b68-48d2-88f1-75bdef5ca891'),
('Istvan Lanyi','istvan lanyi',1,'2022-01-07','2022-01-07',1.78,ARRAY['CAD'],'601c3455-d3ed-4f73-8fdb-76d74091bc54'),
('Mehran Borzoufard Jahromi','mehran borzoufard jahromi',11,'2023-06-12','2023-06-12',303.89,ARRAY['CAD'],'11e194fa-c016-4617-a5d6-393cd85cf2f7'),
('Monika Rybak Wolos','monika rybak wolos',37,'2022-08-25','2023-06-30',907.70,ARRAY['CAD'],'8d1afd44-4b97-4256-ba40-f261412b3dec'),
('Natsu Asakura','natsu asakura',1,'2022-12-12','2022-12-12',41.17,ARRAY['CAD'],'6d0862f2-3e64-4816-aa03-a69acea5f1c4'),
('Randy Van Mingeroet','randy van mingeroet',181,'2022-01-31','2023-07-05',10573.48,ARRAY['CAD'],'214592a5-6931-41db-95bb-5012c2fbd5bd'),
('Roman Soluk','roman soluk',8,'2023-03-28','2023-06-05',530.06,ARRAY['CAD'],'37eaaf32-b831-4413-9ea7-7a70b80c3212');
