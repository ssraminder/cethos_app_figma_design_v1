# Evidence Pack — CAPA, Complaints & Linguist Performance Monitoring

Supports SOP-QA-001 and the IQVIA audit areas **CAPA Management & Complaints Handling** and **Staff/linguist performance monitoring** (ISO 17100 §3.1.8, §4.6). All objects live in Supabase project `lmzoyezvsjgsxveoakdr`. The `qms` schema is reachable only through SECURITY DEFINER functions; run these as service role.

## 1. The closed loop is operational (worked example)
A complaint → nonconformity → root cause → corrective CAPA → effectiveness check → closure was exercised end-to-end on 2026-06-23. Observed:

```
complaint CMP-2026-00004  = linked_nc
nonconformity NC-2026-00003 = closed
capa            = corrective / verified / effective
audit trail     = 8 transitions, hash chain "OK"
```

The operational rows were a no-vendor process-validation case and were removed after the test; the immutable audit-log rows remain by design.

## 2. Every change is immutably logged (tamper evidence)
```sql
-- Append-only, SHA-256 hash-chained. Any UPDATE/DELETE is blocked at three layers.
select * from qms.verify_quality_log_integrity();
-- => ok=true, message 'OK — N rows verified.'

-- Prove immutability:
update qms.quality_event_log set action = 'x' where id = (select min(id) from qms.quality_event_log);
-- => ERROR: qms.quality_event_log is append-only. UPDATE and DELETE are prohibited.
```

## 3. Performance monitoring now captures quality signals (was previously blind)
```sql
-- Event types now emitted (project_completed was the only one before this change):
select event_type, count(*) from qms.performance_events group by event_type order by 1;

-- revision_finding  -> emitted when a step enters 'revision_requested'
-- late_delivery     -> emitted when a step completes after order_workflow_steps.deadline
-- client_complaint  -> emitted when a vendor-linked complaint is logged
-- quality_issue     -> emitted when a vendor-linked nonconformity is raised
-- capa_action_opened / capa_action_closed -> emitted on CAPA open / verify

-- Per-linguist rollup (refreshed daily by the refresh-linguist-perf-snapshot cron):
select count(*) as rows, count(*) filter (where revision_findings>0 or client_complaints>0
  or late_deliveries>0 or quality_issues>0) as with_quality_signal
from qms.linguist_performance_snapshot;
```

## 4. Serious events escalate to re-qualification review (ISO 17100 §3.1.8)
High/critical performance events are picked up by the monthly maintenance run, which flags the linguist for human review (it never auto-suspends).
```sql
select public.qms_run_requalification_maintenance();      -- monthly job
select vendor_id, reason, status, due_date from public.qms_requalification_reviews where status='open';
```

## 5. Register & per-linguist views (what staff see)
```sql
select public.qms_quality_dashboard();                    -- hub: metrics + open NC/CAPA register + linguists to watch
select public.qms_linguist_performance('<vendor_id>');    -- per-linguist 360 (snapshot, events, NCs, CAPA, qualification)
```

## 6. Retention & access
- Records (`qms.quality_complaints`, `qms.nonconformities`, `qms.capa_actions`, `qms.quality_event_log`, `qms.performance_events`) retained ≥ 5 years.
- RLS enabled on all tables; no direct `authenticated` access — staff reach the data only through the audited `quality-read` / `manage-quality` edge functions, which verify the staff session and attribute every write to the acting staff member.
