-- NC-3 (ISO 17100 audit): bind signed NDAs to their application record.
-- Many NDAs were captured by signed_email only (application_id NULL), breaking
-- traceability between the confidentiality agreement and the application /
-- qualification record. This also broke the approval-time NDA carry-over in
-- cvp-approve-application, which keys on application_id. Backfill the unambiguous
-- 1:1 email->application matches; leave ambiguous (email -> >1 application) and
-- no-match rows untouched. ~1,104 rows linked.
WITH appmap AS (
  SELECT lower(email) AS em, (array_agg(id))[1] AS app_id
  FROM cvp_applications
  GROUP BY lower(email)
  HAVING count(*) = 1
)
UPDATE vendor_nda_signatures n
SET application_id = am.app_id
FROM appmap am
WHERE n.application_id IS NULL
  AND n.signed_email IS NOT NULL
  AND lower(n.signed_email) = am.em;
