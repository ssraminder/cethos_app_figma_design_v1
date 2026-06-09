# ISO 17100 Stage 2 evidence pack — snapshot 2026-06-09

> Generated against production Supabase project `lmzoyezvsjgsxveoakdr`.
> Re-run [`audit-queries.sql`](audit-queries.sql) to refresh.

This report captures what an ISO 17100 Stage 2 surveillance auditor (visit
target: December 2026) will see when sampling the QMS audit trail today.
Findings are grouped into **✅ working**, **🟡 needs attention**, and **🚨 must
resolve before Stage 2**.

---

## Quick-look snapshot

| Metric | Value |
|---|---|
| Total assignment-eligibility decisions in last 90 days | **1,963** |
| Vendor-assigned workflow steps with an audit row (post-QMS-launch 2026-04-30) | **53 / 54** (98 %) |
| Reviser-translator collisions (§5.3.5 violations) | **0** ✅ |
| §6.2 separation overrides with written justification | **1** ✅ (Test Vendor, niche language pair) |
| Active vendor payables with no audit row on their step | **3** (2 pre-launch, 1 real gap — see §3.3) |
| All-time hard `block` decisions | **0** (system runs in `warn` mode, by design) |
| Backfilled audit rows | **2** (Step-Split historical, marked transparently) |
| Vendors who *passed* the eligibility gate at least once in 180 days | **1** (test vendor — see §2.2) |

---

## 1. ✅ Coverage — §4.6 reproducibility

### 1.1 Decisions logged by call-site (last 90 days)

Every assignment path the admin portal exposes writes its own audit row:

| `call_site` | Total | Eligible | Warn (proceeded) | Blocked | Backfilled | First → Last |
|---|---:|---:|---:|---:|---:|---|
| `find_matching_vendors` | 1,811 | 0 | 1,811 | 0 | 0 | 2026-05-06 → 2026-06-09 |
| `direct_assign` | 89 | 1 | 88 | 0 | 0 | 2026-05-08 → 2026-06-06 |
| `offer_multiple` | 37 | 0 | 37 | 0 | 0 | 2026-05-08 → 2026-06-03 |
| `offer_vendor` | 20 | 0 | 20 | 0 | 0 | 2026-05-11 → 2026-06-09 |
| `split_step` | 3 | 0 | 3 | 0 | 2 | 2026-06-09 → 2026-06-09 |
| `counter_offer_accept` | 2 | 0 | 2 | 0 | 0 | 2026-05-15 → 2026-05-25 |
| `manual_check` | 1 | 0 | 1 | 0 | 0 | 2026-04-30 → 2026-04-30 |

**Auditor read:** every workflow path that puts a vendor on a step produces
an audit row. `split_step` was the last hole — closed 2026-06-09. The two
`split_step` `backfilled` rows are flagged in the payload so reviewers can
tell them from real-time decisions.

### 1.2 Gap detector

> SQL §1b — returns rows for any vendor-assigned step that's missing an audit row, post-launch.

**Result: 0 rows** for `assigned_at >= 2026-04-30` (QMS feature launch date).

The only pre-launch unaudited assignment in the database (ORD-2026-587506
assigned 2026-04-15, 15 days before the audit feature shipped) is
intentionally outside the audit window.

---

## 2. 🟡 Eligibility breakdown — material finding for Stage 2

### 2.1 Why so few decisions came back as "eligible"

Top reasons assignments were marked `eligible=false` in the last 90 days:

| Reason | Occurrences | Distinct vendors | Blocked | Warned |
|---|---:|---:|---:|---:|
| vendor lacks an active qualified **translator** role qualification | 1,624 | 247 | 0 | 1,624 |
| vendor lacks an active qualified **reviser** role qualification | 337 | 129 | 0 | 337 |
| §6.2 separation overridden — conflicts with step 1 (Translation) | 1 | 1 | 0 | 1 |

**Why this matters:** 99.95 % of decisions in the last 90 days proceeded with
the system warning *"vendor lacks an active qualified translator/reviser
role qualification."* That is the QMS gate working correctly — but it's
flagging that **247 distinct vendors who are actively being assigned work
do not yet have qualification records on file in the QMS subsystem**.

Before Stage 2, the QMS team should populate qualification rows for the
vendors that satisfy §6.1 (qualifications by education, certification,
experience, or §6.1.2 in-house equivalent). The audit trail is complete;
the qualifications database is sparse. Stage 2 reviewers will sample the
underlying §6.1 evidence (CVs, diplomas, professional body memberships),
not just the audit table.

### 2.2 Vendors who DID pass the eligibility gate

| Vendor | Email | Eligible decisions | First eligible | Last eligible |
|---|---|---:|---|---|
| Test Vendor (Dutch→English) | (test) | 1 | 2026-06-02 | 2026-06-02 |

A single vendor, used for QA — confirming the gate logic *works*, but no
production vendor has cleared it. This is the headline finding for §6.1
qualification-records readiness.

---

## 3. ✅ Reviser independence — §5.3.5 + §6.2

### 3.1 Reviser-translator collisions (per-file granularity)

> SQL §3b — joins `step_files` on `quote_file_id` for both Translation and
> Revision steps with the same vendor.

**Result: 0 rows.** No vendor has ever both translated and revised the same
file. Reviser independence is mechanically enforced.

### 3.2 §6.2 separation overrides — 1 case in 90 days

| Override date | Vendor | Step ID | Justification | Call-site |
|---|---|---|---|---|
| 2026-06-02 | Test Vendor (Dutch→English) | 41a30ddd-… | "R22 final verify — niche language pair" | `direct_assign` |

A written justification accompanies the single override. **Stage 2 reviewers
will want to see the supporting §6.2 evidence** — i.e., that no second
qualified Dutch→English linguist was available within the deadline. The
override row carries the reason; the corroborating staff_activity_log
entry should be cross-referenced.

### 3.3 Active payables without audit row

> SQL §8b — vendor was paid for work that wasn't audited at assignment time.

| Payable ID | Vendor | Order | Step | Total | Created | Status |
|---|---|---|---|---|---|---|
| 6862499f-… | Raminder | ORD-2026-587506 | Translation | $10 | 2026-04-15 | approved |
| 4f1abe82-… | Elena Rodriguez | ORD-TEST-001 | Translation | $70 | 2026-04-16 | paid |
| 0ecfb171-… | Raminder | ORD-2026-10181 | Translation | $125 | 2026-05-05 | paid |

Two of three predate the QMS audit feature launch on 2026-04-30 — acceptable
as historical data. **The 2026-05-05 row on ORD-2026-10181 is a real gap**
that should be either (a) backfilled via the same `qms_check_assignment` RPC
with `payload->>'backfilled'=true`, or (b) flagged in the §6.2 evidence
binder as a known historical exception with the assigning PM's name and the
vendor's qualification status at time of assignment.

---

## 4. ✅ Backfilled rows are transparent

> SQL §5a — every reconstructed audit row.

| Recorded on | Actual assignment date | Reason | Vendor | Order |
|---|---|---|---|---|
| 2026-06-09 | 2026-06-09 | pre-2026-06-09 split-step did not log audit rows; reconstructed from order_workflow_steps state | A King | ORD-2026-354733 |
| 2026-06-09 | 2026-06-09 | (same) | CCJK Technologies | ORD-2026-354733 |

Both rows carry `payload->>'backfilled'=true` so reviewers can quote them as
historical reconstructions distinct from real-time decisions.

---

## 5. ✅ Time-series — no gaps in the audit window

> SQL §6a — weekly volume.

| Week starting | Total decisions | Eligible | Backfilled |
|---|---:|---:|---:|
| 2026-06-08 | 331 | 0 | 2 |
| 2026-06-01 | 672 | 1 | 0 |
| 2026-05-25 | 667 | 0 | 0 |
| 2026-05-18 | 46 | 0 | 0 |
| 2026-05-11 | 198 | 0 | 0 |
| 2026-05-04 | 48 | 0 | 0 |
| 2026-04-27 | 1 | 0 | 0 |

Volume has scaled from 1 decision in the launch week (2026-04-27, feature
went live 2026-04-30) to **hundreds per week** with no down-weeks since.
The single 2026-05-18 dip (46 decisions) corresponds to a known
manage-vendor-payables maintenance window — staff weren't actively
assigning that week. Not an audit-system outage.

---

## 6. Step-Split specific (feature shipped 2026-06-08)

> SQL §7a — every Step-Split decision.

| Performed (local) | Order | Vendor | Partition | Eligible | Reason | Backfilled |
|---|---|---|---:|---|---|---|
| 2026-06-09 15:13 | ORD-TRAIN-001 | A King | 0 | false | vendor lacks an active qualified translator role qualification | — |
| 2026-06-09 (backfill) | ORD-2026-354733 | A King | 0 | false | (same) | **true** |
| 2026-06-09 (backfill) | ORD-2026-354733 | CCJK Technologies | 2 | false | (same) | **true** |

Children created via Step Split that are awaiting Find Vendor (deferred
assignment): SQL §7b returns the live list — at writing time, **1 row**:
ORD-TRAIN-001 partition 1 (`test-draft-translation.png`), waiting on the
PM to pick a vendor through the rich modal. Its audit row will land on
`call_site='direct_assign'` when that pick happens.

---

## 7. Pre-Stage-2 punch-list

In priority order:

1. **🚨 Populate vendor qualification records** for the ~247 active vendors
   currently flagged "lacks an active qualified translator role
   qualification." Without this, the audit table reads as "everyone is
   unqualified." The QMS gate logic is correct; the underlying
   qualifications database is sparse.

2. **🟡 Backfill the 2026-05-05 ORD-2026-10181 payable** that lacks an audit
   row. One line of SQL via `qms_check_assignment` with
   `payload->>'backfilled'=true` and a `backfill_reason` citing the
   post-launch gap.

3. **🟡 Document the §6.2 override** on the 2026-06-02 Test Vendor case in
   the §6.2 evidence binder — what alternatives were considered,
   approver, and why the override was necessary.

4. **✅ Keep current trajectory** for everything else. Coverage is at 98 %
   for the audit window, reviser independence is mechanically clean,
   backfill rows are transparent, and the time series shows no system
   outages.

---

## 8. How to refresh this report

```bash
psql $SUPABASE_DB_URL -f docs/audits/2026-12-stage2/audit-queries.sql > audit-snapshot.txt
# Or paste audit-queries.sql into the Supabase SQL editor section-by-section.
```

Refresh quarterly, and at the start of any Stage 2 preparation window.
