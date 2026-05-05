# Decisions

Architectural, product, and business decisions made in this project — with rationale, so future sessions don't relitigate settled questions.

## Format
Append new entries at the top (newest first). For each:

```
### YYYY-MM-DD — Short decision title
- **Decision:** what was chosen
- **Rationale:** why
- **Alternatives considered:** what was rejected and why
- **Status:** active | superseded by [date] | reverted
- **Affects:** which parts of the codebase or product this touches
```

If a decision is later reversed or refined, mark the old one **superseded** rather than deleting — the history matters.

## Decisions

### 2026-05-05 — Internal project numbers (PRJ-YYYY-NNNNN) for vendor-facing grouping
- **Decision:** Cethos-generated internal project numbers group related quotes/orders. Used in all vendor-facing communication instead of the client-supplied `client_project_number`.
- **Rationale:** Business clients submit recurring tasks under the same project at different dates; vendors need continuity context (prior tasks, glossary, style guide) to stay consistent. The raw `client_project_number` may carry client identifiers and shouldn't reach vendors.
- **Format:** `PRJ-YYYY-NNNNN` — matches existing `QT-YYYY-NNNNN` and `INV-YYYY-NNNNNN` conventions.
- **Scope:** Project keyed by `company_id` when present (multiple buyer contacts at the same company collapse into one project); falls back to `customer_id` for retail/certified one-offs.
- **Lifecycle:** `find_or_create_internal_project()` RPC: same `(company_id, client_project_number)` → link to existing; new combo → fresh PRJ number. Every quote and every order has exactly one project.
- **Alternatives considered:** Auto-find-or-create by free-text `client_project_number` only (rejected: typos cause silent dupes); raw `client_project_number` shown to vendors (rejected: anonymization risk); no project entity, group by query (rejected: nowhere to centralize glossary/style guide/vendor notes).
- **Status:** active — Phase 1 (schema + 4 order-creation edge functions) deployed to project `lmzoyezvsjgsxveoakdr` 2026-05-05.
- **Affects:** `internal_projects` table; edge functions admin-create-order, create-fast-quote, create-fast-quote-kiosk, crm-create-order. Pending: order form picker UI in `AdminCreateOrder.tsx`, project detail page, vendor portal display.

### 2026-05-05 — Customer-name anonymization to vendors deferred
- **Decision:** Do not audit/scrub the customer's name from vendor-facing surfaces (job detail, file metadata, message threads) in this phase.
- **Rationale:** Hiding `client_project_number` is a partial anonymization win. Full anonymization is a separate workstream and was deprioritized to ship project numbers first.
- **Status:** parked — revisit after vendor portal starts displaying PRJ numbers and the gap becomes user-visible.
- **Affects:** vendor portal job detail, file naming conventions, message templates.
