# XTRF → Portal Cutover: Readiness + Scripts

**Status:** Skeleton. Run-through required before flipping the switch.
**Current state (2026-04-21):**
- 120 orders already carry `xtrf_project_id` (active link to XTRF)
- 120 customers already carry `xtrf_customer_id`
- **0** services have `xtrf_job_type_id` populated — gap to close

---

## 1. Readiness checklist (do-before-cutover)

Tick these off in order. Don't proceed until each is green.

### 1.1 Data hygiene in the portal
- [ ] `services.xtrf_job_type_id` backfilled for every active XTRF job type (see §2)
- [ ] `customers.xtrf_customer_id` matches the XTRF source for all AR clients we'll carry over
- [ ] `quotes.service_id` and `orders.service_id` confirmed non-NULL for all post-migration rows (already done in Phase 1)
- [ ] Workflow templates exist for every service that will have active XTRF projects (seed missing ones — see §3)

### 1.2 XTRF export
- [ ] Export XTRF projects with status ∈ {active, in-progress, on-hold, pending-QA}
- [ ] Export includes: project id, project number, customer id (XTRF), job type id, source/target lang, line items (word count, rate, currency), total agreed, total cost, currency, created_at, deadline
- [ ] Dump as CSV or JSON, one row per project
- [ ] For each project: attached files list (vendor deliverables + source docs) with storage paths

### 1.3 People + process
- [ ] Ops lead owns the cutover window (date agreed)
- [ ] Freeze new XTRF project creation 24h before cutover (communicate to team)
- [ ] Vendor portal release already deployed (Phase 5 — confirmed no changes needed, already service-agnostic)
- [ ] Stakeholders know there may be a 2–4h gap between "XTRF frozen" and "portal live for non-cert"
- [ ] Backup taken of portal DB immediately before migration starts

### 1.4 Portal readiness (all done in Phases 1–4)
- [x] `admin-create-order` edge function live
- [x] `AdminCreateOrder.tsx` UI live
- [x] `create_invoice_from_order` supports partial invoicing
- [x] `orders.is_direct_order`, `orders.invoiced_total`, `ai_analysis_results.calculation_unit` columns present
- [x] AR dashboard filters by service
- [x] QuoteReviewPage service-aware

---

## 2. Backfill `services.xtrf_job_type_id`

Populate the bridge so migrated rows can resolve their service. Run this **once** after confirming the XTRF job-type ID list from the ops team.

```sql
-- Template — fill in the real XTRF job-type IDs before running
BEGIN;

UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'certified_translation';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'standard_translation';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'medical_translation';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'review';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'editing';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'proofreading';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'mtpe';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'back_translation';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'cognitive_debriefing';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'clinician_review';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'reconciliation';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'harmonization';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'linguistic_validation_migration';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'linguistic_validation_migration_qm';
UPDATE services SET xtrf_job_type_id = <id>, xtrf_job_type_name = '<name>' WHERE code = 'screenshot_review';
-- ...continue for any service we expect to see in XTRF exports...

-- Sanity: anything that should have an XTRF mapping but doesn't
SELECT id, code, name, category
  FROM services
 WHERE is_active = TRUE
   AND xtrf_job_type_id IS NULL
   AND category IN ('translation','review_qa','interpretation');

COMMIT;
```

---

## 3. Seed workflow templates for services that lack one

Services without a workflow template can still be assigned to an order, but admins have to pick a template every time. Before cutover, seed at minimum a "service default" workflow for the services that carry active XTRF projects. Use the admin UI, or SQL like:

```sql
-- Example: minimal 2-step default for 'review' service
WITH svc AS (SELECT id FROM services WHERE code = 'review')
INSERT INTO workflow_templates (code, name, description, service_id, is_default, is_active)
SELECT 'review_default', 'Review (default)', 'Single-reviewer workflow',
       svc.id, TRUE, TRUE
FROM svc
ON CONFLICT DO NOTHING
RETURNING id, code;

-- Then insert workflow_template_steps for the new template_id.
```

---

## 4. Migration script skeleton

Drop the XTRF export JSON into `/tmp/xtrf-export.json` on a workstation that has a service-role key. Run this script (Node or Deno — sketched as pseudo-SQL below):

```sql
-- Wrap the whole migration in a transaction per batch (not whole-file, to stay recoverable)
-- Expect one row per XTRF project. Fields named xtrf_* are from the export.

DO $$
DECLARE
  v_project RECORD;
  v_customer_id UUID;
  v_service_id UUID;
  v_quote_id UUID;
  v_order_id UUID;
  v_quote_number TEXT;
BEGIN
  FOR v_project IN
    SELECT * FROM xtrf_staging -- temp table loaded from JSON
    WHERE migrated_at IS NULL
    LIMIT 50
  LOOP
    -- 1. Resolve customer (must already exist with matching xtrf_customer_id)
    SELECT id INTO v_customer_id
      FROM customers
     WHERE xtrf_customer_id = v_project.xtrf_customer_id;
    IF v_customer_id IS NULL THEN
      RAISE WARNING 'Skipping project % — unknown customer xtrf_id=%',
        v_project.xtrf_project_id, v_project.xtrf_customer_id;
      CONTINUE;
    END IF;

    -- 2. Resolve service from xtrf_job_type_id
    SELECT id INTO v_service_id
      FROM services
     WHERE xtrf_job_type_id = v_project.xtrf_job_type_id;
    IF v_service_id IS NULL THEN
      v_service_id := (SELECT id FROM services WHERE code = 'standard_translation');
      RAISE WARNING 'Project %: unknown xtrf_job_type_id=%, falling back to standard_translation',
        v_project.xtrf_project_id, v_project.xtrf_job_type_id;
    END IF;

    -- 3. Generate quote number (reuse portal logic)
    v_quote_number := 'QT-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
                      lpad(nextval('quote_number_seq')::text, 5, '0');

    -- 4. Insert quote (status=paid, entry_point=xtrf_import)
    INSERT INTO quotes (
      quote_number, customer_id, status, processing_status,
      service_id, source_language_id, target_language_id,
      subtotal, tax_amount, total,
      is_manual_quote, entry_point, paid_at
    ) VALUES (
      v_quote_number, v_customer_id, 'paid', 'quote_ready',
      v_service_id,
      (SELECT id FROM languages WHERE code = v_project.source_lang_code),
      (SELECT id FROM languages WHERE code = v_project.target_lang_code),
      v_project.xtrf_total_agreed, 0, v_project.xtrf_total_agreed,
      TRUE, 'xtrf_import', v_project.created_at
    ) RETURNING id INTO v_quote_id;

    -- 5. Insert order (is_direct_order=TRUE, xtrf_* columns populated)
    INSERT INTO orders (
      quote_id, customer_id, service_id, status, work_status,
      is_direct_order,
      subtotal, tax_amount, total_amount, amount_paid, balance_due,
      currency,
      xtrf_project_id, xtrf_project_number, xtrf_status,
      xtrf_project_total_agreed, xtrf_project_total_cost, xtrf_project_currency_code,
      xtrf_project_link_source, xtrf_project_linked_at
    ) VALUES (
      v_quote_id, v_customer_id, v_service_id, 'paid', 'in_progress',
      TRUE,
      v_project.xtrf_total_agreed, 0, v_project.xtrf_total_agreed, 0,
      v_project.xtrf_total_agreed,
      v_project.xtrf_currency_code,
      v_project.xtrf_project_id, v_project.xtrf_project_number, v_project.xtrf_status,
      v_project.xtrf_total_agreed, v_project.xtrf_total_cost, v_project.xtrf_currency_code,
      'cutover_migration', now()
    ) RETURNING id INTO v_order_id;

    -- 6. Insert line items (one ai_analysis_results row per XTRF line)
    INSERT INTO ai_analysis_results (
      quote_id, manual_filename,
      calculation_unit, unit_quantity, base_rate, line_total,
      processing_status, ocr_provider, is_staff_created
    )
    SELECT v_quote_id, li.description,
           li.calc_unit, li.quantity, li.rate, li.line_total,
           'completed', 'xtrf_import', TRUE
      FROM jsonb_to_recordset(v_project.line_items)
        AS li(description TEXT, calc_unit TEXT, quantity NUMERIC, rate NUMERIC, line_total NUMERIC);

    -- 7. Mark staging row as migrated
    UPDATE xtrf_staging SET migrated_at = now(), portal_order_id = v_order_id
     WHERE xtrf_project_id = v_project.xtrf_project_id;
  END LOOP;
END $$;
```

**Notes:**
- Process in batches of 50 to stay recoverable.
- `xtrf_staging` is a temp/scratch table you load from the export (create with appropriate columns).
- The 120 orders already linked to XTRF (pre-cutover) are skipped by the `xtrf_project_id` uniqueness check — add `ON CONFLICT DO NOTHING` on `xtrf_project_id` if you run the script defensively.
- Files/attachments migration is a separate step (storage-level copy into the `invoices` / `order-files` buckets).

---

## 5. Post-migration verification

Run these before unfreezing operations.

```sql
-- Every migrated order has a service + line items
SELECT count(*) AS orphans
  FROM orders o
 WHERE xtrf_project_link_source = 'cutover_migration'
   AND (o.service_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM quotes q
                         WHERE q.id = o.quote_id
                           AND EXISTS (SELECT 1 FROM ai_analysis_results
                                         WHERE quote_id = q.id)));

-- Sum of migrated totals matches the XTRF export
SELECT
  (SELECT sum(xtrf_total_agreed) FROM xtrf_staging WHERE migrated_at IS NOT NULL) AS xtrf_sum,
  (SELECT sum(total_amount)       FROM orders      WHERE xtrf_project_link_source = 'cutover_migration') AS portal_sum;

-- Any projects that still need hand-cleanup
SELECT xtrf_project_id, xtrf_project_number
  FROM xtrf_staging
 WHERE migrated_at IS NULL;
```

---

## 6. Rollback plan

If something goes wrong mid-cutover:

1. **DB:** restore the pre-cutover backup (taken in §1.3).
2. **App:** no code revert needed — the portal code works pre- and post-cutover. Only data changed.
3. **XTRF:** unfreeze project creation; XTRF remains the system of record until re-cutover.
4. Take a post-mortem note on what failed (row count mismatch? missing service mapping? file copy failure?) and fix before re-attempting.

---

## 7. Post-cutover: turning off XTRF

Only flip this **after** §5 verification passes and ops confirms no gaps:

- [ ] Revoke write access for portal sync webhooks → XTRF API
- [ ] Lock down XTRF to a small set of read-only accounts for historical reference
- [ ] Disable the `trigger_xtrf_push_on_payment` trigger on `orders` (investigate first — may still drive useful behavior)
- [ ] Decommission the XTRF sync edge functions (if any exist) after 30-day observation window

---

## 8. Out of scope

- Migrating historical (closed / delivered / cancelled) XTRF projects — that's archival, not cutover.
- Migrating vendor payables / XTRF invoices — vendor portal already has its own payables flow; handle separately if needed.
- Migrating CAT-tool memory/TMX data — deferred (blueprint Phase 7).

---

*End of cutover plan. All code-side work for non-certified projects is complete; this doc is the operational playbook.*
