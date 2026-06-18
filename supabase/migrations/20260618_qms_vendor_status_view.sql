-- Vendor-list QMS status: one row per vendor that has ANY role_qualification,
-- carrying the highest-priority status (so the admin vendor list can show a
-- qualification badge and filter by qualified / preliminary / under_review /
-- suspended, not just the binary qualified view qms_vendor_qualified_roles).
-- Plain view, postgres-owned, same access posture as qms_vendor_qualified_roles.
-- Applied to prod via MCP 2026-06-18.
CREATE OR REPLACE VIEW public.qms_vendor_status AS
SELECT rq.vendor_id,
       (array_agg(rq.status::text ORDER BY CASE rq.status
          WHEN 'qualified'    THEN 1
          WHEN 'preliminary'  THEN 2
          WHEN 'under_review' THEN 3
          WHEN 'suspended'    THEN 4
          WHEN 'expired'      THEN 5
          WHEN 'withdrawn'    THEN 6
          ELSE 7 END))[1] AS qual_status,
       min(CASE rq.status
          WHEN 'qualified'    THEN 1
          WHEN 'preliminary'  THEN 2
          WHEN 'under_review' THEN 3
          WHEN 'suspended'    THEN 4
          WHEN 'expired'      THEN 5
          WHEN 'withdrawn'    THEN 6
          ELSE 7 END) AS qual_rank,
       min(rq.re_qualification_due) FILTER (WHERE rq.status = 'qualified') AS requal_due
FROM qms.role_qualifications rq
GROUP BY rq.vendor_id;

GRANT SELECT ON public.qms_vendor_status TO anon, authenticated, service_role;
