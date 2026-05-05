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

### 2026-05-05 — Cethos CAT integration parked (not a today task)
- **Decision:** Don't squeeze a Cethos CAT integration into the same session as Phases 1–5. Treat it as its own initiative.
- **What it is:** `D:\cethos\TM-Cethos` (`cethos-cat` v0.1.0) is a full XTM/Trados-class CAT editor — segment-level translation, TM/termbase leverage, QA profiles, translator/reviewer/PM/admin roles. Has its own Supabase project `idzwtssftpxrsprzjael` (separate from the portal's `lmzoyezvsjgsxveoakdr`) and its own `clients`/`jobs`/`segments` data model.
- **Existing integration plumbing:**
  - `POST /api/jobs/ingest` — Bearer-API-key (`scope=tms_ingest`). Body accepts source file (b64 or URL), source/target lang, `external_ref`, `client_external_ref`, `assigned_to_email`, `qa_profile_id`, `tm_ids`, `termbase_ids`, deadline.
  - `/sso?token=...&job=...` — vendor portal → CAT handoff via signed JWT.
- **Why not today:** Real design decisions required — identity mapping (portal `customers`/`companies` ↔ CAT `clients`), TM scoping (per project / client / lang pair), when to push (order create / vendor accept), round-trip (segment harvest back to `step_deliveries`), API key + env wiring, SSO from vendor job detail. Easily 1–2 weeks done well.
- **Smallest plausible slice (when picked up):** "Open in Cethos CAT" link on `AdminProjectDetail` using `client_project_number` as the `client_external_ref` bridge. Half-day if CAT has a matching landing route, longer if that route needs to be added on the CAT side.
- **Status:** parked — revisit as a dedicated initiative, not as an ad-hoc add-on.
- **Affects:** future `AdminProjectDetail.tsx`, future portal env (`CAT_API_KEY`, `NEXT_PUBLIC_CAT_URL`), future edge function for job push, future vendor portal SSO link.

### 2026-05-05 — Project asset uploads: glossary + style guide (Phase 5)
- **Decision:** Staff can upload a glossary file and a style guide file per project on `AdminProjectDetail`. Files surface to vendors as Reference Materials on the job detail, tagged with source so vendors can spot which is the project glossary vs project style guide.
- **Storage:** new private `project-assets` bucket. Path scheme `{project_id}/glossary/{filename}` and `{project_id}/style-guide/{filename}`. 50 MB cap, allowed MIME types: PDF, Word, Excel, ODT, ODS, TXT, CSV, MD.
- **Access:** authenticated staff get full CRUD via portal; vendors never touch the bucket directly — they receive 1-hour signed URLs minted by `vendor-get-job-detail` (service role).
- **Re-upload behavior:** uploading a different filename deletes the old object first (avoids orphaned files). Same filename uses upsert.
- **Implementation:** migration `20260505_project_assets_bucket.sql` (applied), `AdminProjectDetail.tsx` Assets section with upload/replace/remove + signed-URL download, `vendor-get-job-detail` v30 prepends signed URLs to `reference_files` with `source: "project_glossary"` / `"project_style_guide"`, vendor `JobDetailModal` shows the source label as a small green badge above each row.
- **Status:** active.
- **Pending:** none for the basic asset flow. Translation memory at the project level stays a future workstream.
- **Affects:** `internal_projects.{glossary,style_guide}_storage_path` (already in schema), new `project-assets` storage bucket, `AdminProjectDetail.tsx`, `vendor-get-job-detail` edge function, vendor `JobDetailModal`.

### 2026-05-05 — Vendor stickiness in assignment (Phase 4)
- **Decision:** When staff use the vendor finder for a step on an order linked to an internal project, vendors who delivered prior tasks on that same project receive a `prior_project_tasks` count + match-score boost (+30 per prior task, capped at 100). UI shows a teal "↪ N prior tasks on this project" badge.
- **Rationale:** Closes the original recurring-client consistency goal at the assignment step itself — staff naturally see the prior contributor first when sending a new task. Vendor notes (Phase 2c) help the vendor stay consistent; stickiness helps avoid even needing to switch in the first place.
- **Statuses counted as "prior task":** `delivered`, `under_review`, `approved`, `completed` on `order_workflow_steps` for orders sharing the same `internal_project_id`. Pending / offered / declined steps don't count — only actual work.
- **Cap rationale:** +100 max keeps a super-prolific vendor from monopolizing every offer regardless of fit; rating, language, and availability still matter.
- **Status:** active — `find-matching-vendors` v30 deployed to `lmzoyezvsjgsxveoakdr`. UI changes in `OrderWorkflowSection.tsx`.
- **Affects:** `find-matching-vendors` edge function, `OrderWorkflowSection.tsx` (`VendorFinderModal` props + main component fetch).

### 2026-05-05 — Inline editing of project name + vendor notes (Phase 2c)
- **Decision:** Add inline edit on `AdminProjectDetail` for two fields: `name` (staff-only internal name) and `vendor_notes` (visible to vendors on their job-detail "Project" banner).
- **Rationale:** Phase 3 wired the vendor display to read `vendor_notes`, but staff had no UI to populate it — only direct DB edits. This closes the loop so the feature actually carries notes in production.
- **Pattern:** Click "Edit" → input/textarea + Save/Cancel. Saves via direct `supabase.from("internal_projects").update(...)` (RLS already allows authenticated update).
- **Out of scope:** Glossary / style guide file uploads (`glossary_storage_path`, `style_guide_storage_path`). Storage bucket + signed-URL plumbing not built yet; revisit when the need shows up.
- **Status:** active.
- **Affects:** `AdminProjectDetail.tsx` only.

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
