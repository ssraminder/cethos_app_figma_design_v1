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

### 2026-05-05 — Project navigation: list, detail, banner, sidebar (Phase 2b)
- **Decision:** Add `/admin/projects` (list) and `/admin/projects/:id` (detail with read-only Tasks list of all linked quotes + orders), a "Projects" sidebar link, and a banner on the order detail page linking back to the project.
- **Rationale:** Phase 1 was accumulating projects in production, but staff had no way to navigate them. The detail view is the answer to "find all tasks in a particular project."
- **Project list query:** plain `internal_projects` SELECT with customer/company joins; client-side text filter. Limit 200, server-side ordered by `updated_at`. Sufficient for now; revisit when project count outgrows it.
- **Banner approach:** separate fetch in AdminOrderDetail (one query for project_number, one count query for sibling tasks). Avoids modifying the existing massive `*` SELECT in `fetchOrderDetails`.
- **Tasks list:** merges quotes + orders into one chronological list. An order created from a quote shares the same `internal_project_id`, so both rows appear; staff can drill into either.
- **Status:** active — committed but not yet exercised in production. Verify by visiting `/admin/projects/{first-real-project-id}` once a few orders accumulate.
- **Affects:** new `AdminProjectsList.tsx`, new `AdminProjectDetail.tsx`, `App.tsx` routing, `AdminLayout.tsx` nav, `AdminOrderDetail.tsx` (interface + banner). No schema or edge-function changes.

### 2026-05-05 — Project picker typeahead in AdminCreateOrder (Phase 2a)
- **Decision:** Replace the plain `client_project_number` text input with a typeahead that searches existing `internal_projects` for the picked customer's company (or customer if no company). Matches against `project_number` (PRJ-YYYY-NNNNN), `client_project_number`, and `name`.
- **Rationale:** Once Phase 1 started auto-stamping projects in production, staff needed visibility into existing projects to avoid creating dupes via inconsistent typing of `client_project_number`.
- **Linking strategy:** Picker pre-fills `clientProjectNumber` from the picked project's `client_project_number`; backend `find_or_create_internal_project` RPC then matches the same project on submit. No edge-function changes needed.
- **Filter:** Picker only surfaces projects with `client_project_number IS NOT NULL`. Anonymous projects (auto-created from one-off orders with no client label) are not pickable here — picking them and pre-filling from `project_number` would create a NEW project with PRJ-... as its label rather than re-link. They'll be reachable from the project detail page (next phase).
- **Status:** active — committed but not yet exercised in production. Verify by creating a direct order and confirming the typeahead surfaces existing projects.
- **Affects:** `client/pages/admin/AdminCreateOrder.tsx` only. No schema or edge-function changes.

### 2026-05-05 — Internal project numbers (PRJ-YYYY-NNNNN) for vendor-facing grouping
- **Decision:** Cethos-generated internal project numbers group related quotes/orders. Used in all vendor-facing communication instead of the client-supplied `client_project_number`.
- **Rationale:** Business clients submit recurring tasks under the same project at different dates; vendors need continuity context (prior tasks, glossary, style guide) to stay consistent. The raw `client_project_number` may carry client identifiers and shouldn't reach vendors.
- **Format:** `PRJ-YYYY-NNNNN` — matches existing `QT-YYYY-NNNNN` and `INV-YYYY-NNNNNN` conventions.
- **Scope:** Project keyed by `company_id` when present (multiple buyer contacts at the same company collapse into one project); falls back to `customer_id` for retail/certified one-offs.
- **Lifecycle:** `find_or_create_internal_project()` RPC: same `(company_id, client_project_number)` → link to existing; new combo → fresh PRJ number. Every quote and every order has exactly one project.
- **Alternatives considered:** Auto-find-or-create by free-text `client_project_number` only (rejected: typos cause silent dupes); raw `client_project_number` shown to vendors (rejected: anonymization risk); no project entity, group by query (rejected: nowhere to centralize glossary/style guide/vendor notes).
- **Status:** active — Phase 1 (schema + 4 order-creation edge functions) deployed to project `lmzoyezvsjgsxveoakdr` 2026-05-05.
- **Affects:** `internal_projects` table; edge functions admin-create-order, create-fast-quote, create-fast-quote-kiosk, crm-create-order. Pending: order form picker UI in `AdminCreateOrder.tsx`, project detail page, vendor portal display.

### 2026-05-05 — Customer-name anonymization to vendors: not required
- **Decision:** Do not pursue scrubbing customer name from vendor-facing surfaces. Vendors may continue to see customer first name / company name on job detail, file paths, and message threads as they do today.
- **Rationale:** Confirmed by Raminder 2026-05-05 after Phase 3 shipped. The PRJ-YYYY-NNNNN abstraction is the only client-identifier change wanted; deeper anonymization is not a goal.
- **Status:** active — supersedes the earlier "deferred / parked" entry from this same date. Don't relitigate.
- **Affects:** nothing — explicit non-action.
