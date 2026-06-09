-- ============================================================================
-- ISO 17100 Stage 2 evidence pack — runnable audit queries
-- Cethos Translation Services
-- Drafted for the December 2026 surveillance audit
--
-- Every query stands alone. Run individually or paste the whole file into
-- the Supabase SQL editor / psql to produce the auditor's evidence sheet.
--
-- Sections:
--   1. Coverage — every assignment has an audit row
--   2. Eligibility breakdown — what the QMS gate said at decision time
--   3. Reviser independence (§5.3.5 / §6.2 separation)
--   4. Vendor qualification posture
--   5. Backfilled vs real-time decisions (transparency)
--   6. Time-series view for the audit window
--   7. Step-split specific (post-2026-06-08 feature)
--   8. Failure modes — orphaned assignments + non-fatal warnings
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. COVERAGE — proves §4.6 reproducibility
-- ──────────────────────────────────────────────────────────────────────────

-- 1a. Every assignment decision logged in the last N days, broken down by
--     call_site (the workflow path the assignment came through).
SELECT call_site,
       COUNT(*)                                              AS total_decisions,
       COUNT(*) FILTER (WHERE eligible = true)               AS eligible,
       COUNT(*) FILTER (WHERE eligible = false
                          AND gating_mode = 'warn')          AS proceeded_with_warning,
       COUNT(*) FILTER (WHERE eligible = false
                          AND gating_mode = 'block')         AS blocked,
       COUNT(*) FILTER (WHERE payload->>'backfilled' = 'true') AS backfilled,
       MIN(performed_at)::date                               AS first_decision,
       MAX(performed_at)::date                               AS last_decision
  FROM qms.assignment_eligibility_events
 WHERE performed_at >= NOW() - INTERVAL '90 days'
 GROUP BY call_site
 ORDER BY total_decisions DESC;

-- 1b. Gap detector — vendor-assigned workflow steps without ANY audit row.
--     Stage 2 expects this to be empty (or limited to pre-audit-system rows
--     where assigned_at predates the QMS feature launch on 2026-04-30).
WITH steps AS (
  SELECT s.id AS step_id, s.order_id, s.vendor_id, s.assigned_at,
         s.parent_step_id IS NOT NULL AS is_split_child,
         o.order_number, s.name AS step_name
    FROM order_workflow_steps s
    JOIN orders o ON o.id = s.order_id
   WHERE s.vendor_id IS NOT NULL
     AND s.actor_type = 'external_vendor'
     AND s.assigned_at >= '2026-04-30'  -- QMS audit feature launch date
)
SELECT s.step_id, s.assigned_at, v.full_name AS vendor, s.order_number,
       s.step_name, s.is_split_child
  FROM steps s
  LEFT JOIN vendors v ON v.id = s.vendor_id
 WHERE NOT EXISTS (SELECT 1 FROM qms.assignment_eligibility_events e
                    WHERE e.workflow_step_id = s.step_id)
 ORDER BY s.assigned_at DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. ELIGIBILITY BREAKDOWN — why the gate flagged what it did
-- ──────────────────────────────────────────────────────────────────────────

-- 2a. Top reasons assignments were marked not-eligible.
SELECT reason,
       COUNT(*) AS occurrences,
       COUNT(DISTINCT vendor_id) AS distinct_vendors,
       COUNT(*) FILTER (WHERE gating_mode = 'block') AS blocked,
       COUNT(*) FILTER (WHERE gating_mode = 'warn')  AS warned
  FROM qms.assignment_eligibility_events
 WHERE eligible = false AND performed_at >= NOW() - INTERVAL '90 days'
 GROUP BY reason
 ORDER BY occurrences DESC;

-- 2b. Vendors who DID pass the eligibility gate (have at least one
--     active qualified role per §6.1).
SELECT v.full_name AS vendor, v.email,
       COUNT(*) AS eligible_decisions,
       MIN(e.performed_at)::date AS first_eligible_decision,
       MAX(e.performed_at)::date AS most_recent_eligible_decision
  FROM qms.assignment_eligibility_events e
  JOIN vendors v ON v.id = e.vendor_id
 WHERE e.eligible = true AND e.performed_at >= NOW() - INTERVAL '180 days'
 GROUP BY v.full_name, v.email
 ORDER BY eligible_decisions DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. REVISER INDEPENDENCE — §5.3.5 + §6.2
-- ──────────────────────────────────────────────────────────────────────────

-- 3a. Every §6.2 separation override (translator and reviser must be
--     different — when staff explicitly overrode this for niche-language
--     justifications). Stage 2 expects each override to carry a written
--     reason; queries override_reason must be non-empty.
SELECT e.performed_at::date AS overridden_on,
       v.full_name AS vendor,
       e.override_reason,
       e.workflow_step_id,
       e.payload->>'parent_step_id' AS parent_step,
       e.call_site
  FROM qms.assignment_eligibility_events e
  JOIN vendors v ON v.id = e.vendor_id
 WHERE e.override_reason IS NOT NULL
    OR e.reason LIKE '%§6.2 separation overridden%'
 ORDER BY e.performed_at DESC;

-- 3b. Detect actual reviser-translator collisions on the same FILE
--     (not just the same step — children of split parents need to be
--     checked at file granularity via step_files).
WITH translate_assignments AS (
  SELECT sf.quote_file_id, s.vendor_id, s.order_id, s.id AS step_id
    FROM order_workflow_steps s
    JOIN step_files sf ON sf.step_id = s.id
   WHERE s.actor_type = 'external_vendor' AND s.vendor_id IS NOT NULL
     AND s.name ILIKE '%translation%'
),
revise_assignments AS (
  SELECT sf.quote_file_id, s.vendor_id, s.order_id, s.id AS step_id
    FROM order_workflow_steps s
    JOIN step_files sf ON sf.step_id = s.id
   WHERE s.actor_type = 'external_vendor' AND s.vendor_id IS NOT NULL
     AND s.name ILIKE '%revis%'
)
SELECT t.order_id, t.quote_file_id, t.vendor_id AS shared_vendor,
       t.step_id AS translate_step, r.step_id AS revise_step
  FROM translate_assignments t
  JOIN revise_assignments r
    ON r.quote_file_id = t.quote_file_id AND r.vendor_id = t.vendor_id
 ORDER BY t.order_id;
-- Expected: 0 rows. Any row is a §5.3.5 violation needing override audit.

-- ──────────────────────────────────────────────────────────────────────────
-- 4. VENDOR QUALIFICATION POSTURE
-- ──────────────────────────────────────────────────────────────────────────

-- 4a. Distinct vendors actually receiving assignments in the audit window,
--     and whether their QMS record shows them as qualified.
SELECT v.full_name AS vendor,
       v.email,
       v.status AS vendor_status,
       COUNT(DISTINCT e.workflow_step_id) AS assignments_in_window,
       COUNT(DISTINCT e.workflow_step_id) FILTER (WHERE e.eligible = true) AS qualified_assignments,
       COUNT(DISTINCT e.workflow_step_id) FILTER (WHERE e.eligible = false) AS unqualified_assignments,
       STRING_AGG(DISTINCT e.reason, ' | ' ORDER BY e.reason) FILTER (WHERE e.eligible = false) AS reasons
  FROM qms.assignment_eligibility_events e
  JOIN vendors v ON v.id = e.vendor_id
 WHERE e.performed_at >= NOW() - INTERVAL '180 days'
 GROUP BY v.full_name, v.email, v.status
 ORDER BY assignments_in_window DESC
 LIMIT 50;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. BACKFILLED VS REAL-TIME (transparency)
-- ──────────────────────────────────────────────────────────────────────────

-- 5a. Every reconstructed audit row, with the original assignment date and
--     the migration that introduced it. Stage 2 reviewers should be able to
--     see exactly which rows are reconstructed and why.
SELECT e.performed_at::date AS recorded_on,
       (e.payload->>'original_assigned_at')::timestamptz::date AS actual_assignment_date,
       e.payload->>'backfill_reason' AS reason,
       v.full_name AS vendor,
       e.workflow_step_id,
       o.order_number
  FROM qms.assignment_eligibility_events e
  JOIN vendors v ON v.id = e.vendor_id
  JOIN orders o ON o.id = e.order_id
 WHERE e.payload->>'backfilled' = 'true'
 ORDER BY (e.payload->>'original_assigned_at')::timestamptz DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. TIME-SERIES VIEW
-- ──────────────────────────────────────────────────────────────────────────

-- 6a. Weekly volume of assignment decisions, broken down by gating outcome.
--     Useful for spotting outages (gaps in the timeline = audit system was
--     broken during that period).
SELECT date_trunc('week', performed_at)::date AS week,
       COUNT(*)                                            AS total,
       COUNT(*) FILTER (WHERE eligible = true)             AS eligible,
       COUNT(*) FILTER (WHERE eligible = false)            AS not_eligible,
       COUNT(*) FILTER (WHERE gating_mode = 'block')       AS blocked,
       COUNT(*) FILTER (WHERE override_reason IS NOT NULL) AS overridden,
       COUNT(*) FILTER (WHERE payload->>'backfilled' = 'true') AS backfilled
  FROM qms.assignment_eligibility_events
 WHERE performed_at >= NOW() - INTERVAL '6 months'
 GROUP BY 1
 ORDER BY 1 DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. STEP-SPLIT SPECIFIC (feature shipped 2026-06-08, audit fix 2026-06-09)
-- ──────────────────────────────────────────────────────────────────────────

-- 7a. Every Step-Split decision with full context. This is the query you'd
--     run when the auditor asks "show me every translator assigned through
--     the new Step Split flow since it shipped."
SELECT e.performed_at AT TIME ZONE 'America/Toronto' AS performed_at_local,
       o.order_number,
       v.full_name AS vendor,
       e.payload->>'partition_index' AS partition_idx,
       e.eligible,
       e.reason,
       e.gating_mode,
       e.payload->>'backfilled' AS backfilled,
       e.payload->>'backfill_reason' AS backfill_reason
  FROM qms.assignment_eligibility_events e
  JOIN vendors v ON v.id = e.vendor_id
  JOIN orders o ON o.id = e.order_id
 WHERE e.call_site = 'split_step'
 ORDER BY e.performed_at DESC;

-- 7b. Children created via Step Split that haven't been assigned a vendor
--     yet — these are deferred-assignment partitions awaiting a Find Vendor
--     action. Their audit rows will land via call_site='direct_assign' when
--     the PM picks a vendor on the child.
SELECT o.order_number, c.partition_index,
       c.step_number, c.status, c.created_at, c.actor_type
  FROM order_workflow_steps c
  JOIN orders o ON o.id = c.order_id
 WHERE c.parent_step_id IS NOT NULL
   AND c.actor_type = 'external_vendor'
   AND c.vendor_id IS NULL
   AND c.status = 'pending'
 ORDER BY c.created_at DESC;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. FAILURE MODES + EDGE CASES
-- ──────────────────────────────────────────────────────────────────────────

-- 8a. Eligibility decisions that "blocked" the assignment — these are the
--     hard refusals. Stage 2 expects each blocked decision to have a clear
--     reason and (if subsequently assigned anyway) an override audit row.
SELECT e.performed_at, v.full_name AS vendor, e.workflow_step_id, e.reason,
       e.override_reason,
       o.order_number
  FROM qms.assignment_eligibility_events e
  JOIN vendors v ON v.id = e.vendor_id
  JOIN orders o ON o.id = e.order_id
 WHERE e.gating_mode = 'block'
 ORDER BY e.performed_at DESC;

-- 8b. Vendor children that have a payable but no audit row — should be 0.
--     A non-zero result means we paid a vendor for work we didn't audit.
SELECT vp.id AS payable_id, vp.vendor_id, vp.workflow_step_id, vp.status, vp.total
  FROM vendor_payables vp
 WHERE vp.workflow_step_id IS NOT NULL
   AND vp.status NOT IN ('cancelled', 'voided')
   AND NOT EXISTS (
     SELECT 1 FROM qms.assignment_eligibility_events e
      WHERE e.workflow_step_id = vp.workflow_step_id
   );
