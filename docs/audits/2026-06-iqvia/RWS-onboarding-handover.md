# Handover — RWS Client Project Reconciliation, Workflow Build & Feedback Logging

**Created:** 2026-06-24 · **For:** a fresh Claude Code session · **Author:** prior session (Welocalize onboarding)
**Repo:** `D:\cethos\portal\cethos_app_figma_design_v1` (admin) · Supabase project `lmzoyezvsjgsxveoakdr`

> ### ▶ PROGRESS (2026-06-24, prior session) — START AT `tmp/rws-po-scope.md`
> **Phase 1 substantially done.** RWS = **RWS Life Sciences, Inc.** → use customer **`840f6e4d-6152-46ce-9b09-dc3d5e223a0a`** (USD, tax-exempt, net_30; company `b67fcfd7…`). The 6 RWS PMs already exist (use the PO's "Assigned By" person). POs arrive at lv@cethos.com, auto-generated, **USD**.
> - **Scope confirmed by user: May 1 2026 onwards.**
> - **LV-type suffixes (EILV/NVLV/ABVLV/EUQLV) are RWS internal client codes — NOT workflow indicators.** Drive the Cethos workflow off the **PO line-item task code**.
> - **PO structure + service→Cethos mapping + the full remaining work-list + the build approach are all in [`tmp/rws-po-scope.md`](../../../tmp/rws-po-scope.md).** Read that first.
> - **Reconciliation:** ~15 LV projects; 7 in Cethos, **9 net-new** (261-D1353A-NVLV, 241-K3078A-EILV, 251-K1530A-EILV, 261-B1500A-NVLV, 241-B2556A-EILV, 251-G1155A-EUQLV, 251-C1122C-EILV, 251-L1962C-ABVLV, 261-L1962A-ABVLV). Even in-Cethos projects are under-represented (each PO = a separate task/order).
> - **Service map confirmed from PO bodies:** TRLV→Translation(LV), EDAD→Adapt, pPRF→Paper Proofreading, HARM→Harmonize, + Cognitive Debriefing (from task emails). Expect also BT/Reconciliation/Review as more POs are read.
> - **Remaining work:** read each May-1+ PO body for its scope (4 read so far: GT68461, GT97301, GT81671, GT38811), then build **one un-delivered order+workflow per PO** via a generalized `clone_welo_coa_order` (add `p_service_id`; USD account; approx_bank rate — see the Welocalize memory). Then the COA-client audit-documentation pack.
> - Anything you can't find in email → the user will pull it from the **RWS portal**.

---

## 0. Mission (what this session is for)

Do for **RWS** what the prior session did for **Welocalize**: get all RWS subcontracted work represented in the Cethos admin portal as ISO 17100 / IQVIA-audit-ready orders, and stand up a way to log RWS **feedback / follow-ups**.

Three phases, **in order**:

1. **Build the project list** — reconcile RWS projects across **Dropbox folders + Office 365 email + the admin portal**, and produce a definitive list of RWS projects/tasks and which are *not yet* in Cethos.
2. **Create workflows** — per project, create the order + workflow (the right template per service type), as **un-delivered shells** (unless a deliverable already exists — see §5).
3. **Feedback / follow-up logging** — RWS is an ongoing relationship with feedback, queries, and follow-ups. Decide + implement **how this is logged** (this is an open design decision — see §6).

> Work **one phase at a time**, confirm the list before building, and **proof one order before the bulk** (the user's standing preference: "walk me through one, then I'll give the go-ahead").

---

## 1. The Welocalize precedent — model this on it

The prior session reconciled Welocalize and built the order-creation machinery. **Reuse it.** Key artifacts:

- **Reconciliation method:** exported the vendor platform's task history to XLSX, parsed it with a Node script, and diffed (project + service + target-language) against the Cethos order tuples. See `tmp/diff-export.mjs` and `tmp/read-export.mjs` in the repo for the pattern.
- **Order-creation method:** a SQL clone helper `clone_welo_coa_order(...)` that clones a *template* order's full graph (quote → order → workflow → steps) with per-order overrides, as an **un-delivered shell**. It is still installed in the DB (see §8). Generalize/rename it for RWS (`clone_rws_order` or similar) — RWS has more service types than Welocalize's cog-deb/clinician.
- **Welocalize state for reference:** `docs/audits/2026-06-iqvia/` has the Welocalize audit docs; the diff logic and the order structure are documented in the prior session's memory (`MEMORY.md` → Welocalize entries).

**Hard rules carried over (audit-critical — do not violate):**

- **Never write "cloned from" / "replicated from"** on any order, step, delivery, or note. IQVIA-sensitive. Use neutral references (e.g. the RWS project code / task ID) only.
- **PM must be carefully selected per project** (it is per-project, *not* per-client — verify each).
- **New orders are un-delivered** until the linguist/agency uploads deliverables to the portal — *unless* a deliverable already exists, in which case replicate it (see §5).
- **Create orders via SQL, not `admin-create-order`** — the edge function fires client emails; SQL does not. Always **dry-run / proof one, then commit**.
- **Internal review steps assigned to a staff member** (Welocalize used **Bobby Rawat**, `staff_users.id = 5ec2997c-8826-4847-a350-4b88e206df35`). Confirm the right reviewer for RWS.
- **Per-change loop** (from `CLAUDE.md`): plan → implement → verify on the **live** portal (`portal.cethos.com`) via Chrome MCP → update memory.

---

## 2. RWS in Cethos today (known footprint as of 2026-06-24)

**Company:** `RWS` — `companies.id = b67fcfd7-0cb9-4b9d-a4a7-3e5b3ebb9227`

**Customers — there are TWO records (pick the right one per project):**

| customer_id | label | currency | tax | terms | branch | xtrf |
|---|---|---|---|---|---|---|
| `840f6e4d-6152-46ce-9b09-dc3d5e223a0a` | **"RWS"** (main) | **USD** | **tax-exempt** | net_30 | 1 | xtrf 16 |
| `28b7cca3-3806-4f94-a498-2e5adb9502af` | "Laura Acevedagallo" | **CAD** | **taxable** | net_30 | 1 | — |

> ⚠️ Unlike Welocalize (one tax-exempt USD account), RWS has a USD-tax-exempt account **and** a CAD-taxable one. Determine which applies per project (likely the USD-tax-exempt `840f6e4d…` for US-billed LV work; confirm from the PO/invoice currency in email).

**PMs already in `company_project_managers` (company_id `b67fcfd7…`) — reuse, don't recreate:**

| full_name | email |
|---|---|
| Sofia Rojas | karen.rojas@rws.com |
| Tomas Mendoza Baute | tomas.mendozabaute@rws.com |
| Darshan Bhole | dbhole@rws.com |
| Santhos R | santosh.r@rws.com |
| Małgorzata (Bielecka) | malgorzata.bielecka@rws.com |
| Sylwia Majewicz | Sylwia.Majewicz@rws.com |

(More RWS PMs may surface in email — create only if genuinely missing, `company_id = b67fcfd7…`.)

**Existing orders:** 10 orders, 8 client projects. Project-code pattern looks like COA/PRO **linguistic validation**: `{YY|period}-{StudyCode}-{LVtype}LV`, e.g. `251-E4006A-EILV`, `261-A2224A-EILV`, `251-G1318A-NVLV`, `251-L1393A-EUQLV`, `251-L1962A-ABVLV`. (`ACME-TEST-001` = a test project, ignore.)

**Services seen on RWS orders:** Standard Translation, Editing, Proofreading, Certified Translation, Translation Review, Harmonization, Cognitive Debriefing — **broader than Welocalize.** Map each RWS task's service to the correct Cethos service + workflow template (see §5).

**Workflow templates seen:** `translation_only` (×6), `certified_translation`, `cognitive_debriefing`, `harmonization_review`, `standard_tep`.

**Existing RWS internal_projects** (reuse per project; create a fresh one only for genuinely-new projects — pattern `PRJ-2026-NNNNN`, set manually, `company_id=b67fcfd7…`, `customer_id=<chosen RWS customer>`):

```
PRJ-2026-00031  261-A2229A-EILV
PRJ-2026-00103  251-E4006A-EILV
PRJ-2026-00123  251-G1318A-NVLV
PRJ-2026-00135  241-B5156C-EILV
PRJ-2026-00143  261-A2224A-EILV
PRJ-2026-00155  251-L1962A-ABVLV
(251-L1393A-EUQLV had no RWS-company internal_project — verify)
```

---

## 3. Tools & connections

- **Admin portal** (Chrome MCP, `mcp__Claude_in_Chrome__*`): `https://portal.cethos.com` — already logged in on the user's browser. Use for verifying orders render (e.g. `/admin/orders/<id>`), reading existing RWS orders/projects, and the order **Messages** panel (client-facing comms).
- **Office 365 / Outlook** (`mcp__269bf9be-...__outlook_email_search`, `chat_message_search`, `sharepoint_search`): search RWS correspondence — POs, project assignments, PM names, feedback threads. Useful queries: `rws.com`, the project codes (`251-E4006A`), `purchase order`, study codes. (This is how the prior session found Welocalize PMs.)
- **Dropbox** (`mcp__48e44d40-...__search` / `list_folder` / `get_file_content` / `get_file_metadata`): RWS project folders. Folder naming SOP (from `memory` → `sop_project_folder_naming`): `{ProjectCode} {OrderNumber} {ServiceShort} {Language} ({Country})`. Search by RWS project code to enumerate deliverables/source files.
- **SQL** (Supabase MCP `mcp__e57307c9-...__execute_sql` / `apply_migration`, project `lmzoyezvsjgsxveoakdr`): all order creation + reconciliation queries.

> If RWS has its own **vendor/PM portal** (RWS uses platforms like *Trisoft / RWS Language Cloud*), the user can log in via Chrome MCP — ask. Otherwise the source of truth for RWS tasks is **email + Dropbox + the POs**.

---

## 4. Phase 1 — Build the RWS project list (reconciliation)

Goal: a definitive list of every RWS project/task and which are **not yet** in Cethos.

1. **What Cethos has** — query the 10 existing RWS orders as tuples (project · service · source→target · status):
   ```sql
   select o.order_number, o.client_project_number, s.name svc, o.status, o.work_status,
          (select cpm.full_name from company_project_managers cpm where cpm.id=o.client_pm_id) pm
   from orders o left join services s on s.id=o.service_id
   where o.customer_id in ('840f6e4d-6152-46ce-9b09-dc3d5e223a0a','28b7cca3-3806-4f94-a498-2e5adb9502af')
   order by o.client_project_number;
   ```
2. **What RWS sent** — enumerate RWS work from the authoritative sources:
   - **Dropbox**: `search` for RWS project folders; `list_folder` the RWS area; capture project code, service, languages, and whether a **deliverable** exists.
   - **Office 365**: `outlook_email_search` for RWS POs / assignments (`rws.com`, project codes, `purchase order`). Capture project code, service, languages, amounts, **PM**, and **PO number**.
   - **Portal**: the 10 existing orders (above).
3. **Diff** — produce the missing list: RWS projects/tasks present in Dropbox/email but **not** in Cethos. Present it (table: project · service · languages · amount · PM · has-deliverable?) and **confirm with the user before building**.

> Mirror the Welocalize approach: if RWS can **export** a task/PO list (or the user can), parse it with a Node script and diff programmatically — far more reliable than manual enumeration.

---

## 5. Phase 2 — Create workflows (per project type)

RWS spans multiple services, so **pick the workflow template per task's service**:

| RWS service | Cethos service | workflow `template_code` |
|---|---|---|
| Translation | Standard Translation | `translation_only` or `standard_tep` (TEP if revise+proof required) |
| Editing / Revision | Editing | (revision step) |
| Proofreading | Proofreading | — |
| Certified translation | Certified Translation | `certified_translation` |
| Translation Review | Translation Review | `translation_review` |
| Harmonization | Harmonization | `harmonization_review` |
| Cognitive Debriefing | Cognitive Debriefing | `cognitive_debriefing` |
| Clinician Review | Clinician Review | `clinician_review` |

**Service IDs known:** Cognitive Debriefing `568599b9-e6b4-4be6-9fa9-805df929dcd2`, Clinician Review `5fe95296-e334-4689-ba2b-d3efbdeffa13`. Look up the rest from `services` (`select id,name from services`).

**Creation method:** clone a **template order of the same service** (an existing RWS or Welocalize order with that workflow), overriding language / amount / PM / project / PO / task-ref. The prior session's helper `clone_welo_coa_order(...)` (§8) does this for the 3-step cog-deb/clinician shape; **generalize it** for the other templates (different step counts/actors). Key behaviors it already gets right:

- Inserts only **non-generated** columns (`is_generated <> 'ALWAYS'`), fresh `recovery_token`, nulled portal links.
- `order_number` / `quote_number` auto-set by **BEFORE-INSERT triggers**; `serial_no` from `orders_serial_no_seq`; `_cad` amounts auto-locked by trigger (USD × rate).
- Shell state: `status='in_production'`, `work_status='pending'`, `invoice_status='unbilled'`, `invoiced_total=0`, `amount_paid=0` — **un-delivered, unbilled, no AR pollution.**
- Steps reset to `pending`, vendor cleared, internal QA/Final assigned to the staff reviewer; Welocalize task ref in step-1 `instructions`.
- **No client emails** (pure SQL).

**Currency/tax:** set per the chosen RWS customer (USD/tax-exempt `840f6e4d…` vs CAD/taxable `28b7cca3…`). The CAD-lock trigger handles `_cad` from `exchange_rate_to_cad` (copy from a template or let the trigger pull `currencies.rate_to_cad`).

**If a deliverable already exists** (RWS task completed, file in Dropbox): per the user's standing rule — *don't redo the work*; replicate the existing deliverable into the production step → QA → delivery, then complete post-production. (Prior session did this for Welocalize ORD-10445.) Otherwise leave the shell un-delivered for upload.

---

## 6. Phase 3 — Feedback / follow-up logging (OPEN DESIGN DECISION)

**Current state:** there is **no** `client_communication_log` or `order_lifecycle_events` table. The plan file `~/.claude/plans/we-need-to-enhance-radiant-knuth.md` (Deliverable 2) specifies building exactly these (append-only, SHA-256 hash-chained, WORM, `qms_record_client_communication` / `qms_record_lifecycle_event` RPCs) — **not yet built.**

**What exists today that can hold RWS feedback/follow-ups:**

- **`qms.quality_complaints` + `qms.nonconformities` + `qms.capa_actions` + `qms.quality_event_log`** (hash-chained) — the closed-loop quality system (built 2026-06-23). Right home for a **complaint / quality issue / CAPA** from RWS. `revision_finding` / `late_delivery` signals already wired.
- **`qms.performance_events`** — vendor/linguist performance signals.
- **Order Messages panel** (portal) — client-facing thread per order; "Customer receives an email notification." Good for **outbound follow-ups** but it *emails the client* — use deliberately.
- **`staff_notes`** (`entity_type='order'`, `entity_id=<order_id>`) — internal, un-emailed notes; good for logging a follow-up/феedback summary against an order without contacting anyone.

**Decision to make with the user (don't guess):**
- **(A) Lightweight now:** log RWS feedback as `staff_notes` on the order + route genuine complaints to `qms.quality_complaints`. Zero build, audit-traceable via the quality system. Recommended to start.
- **(B) First-class:** build the `qms.client_communication_log` + `order_lifecycle_events` from the plan (append-only, hash-chained) and wire the send/feedback paths to log. More work; the audit-defensible §4.4/§5.2/§6.1 answer.

Surface both, recommend (A) to start + (B) before the IQVIA Stage 2 audit, and let the user choose.

---

## 7. Audit-critical conventions & guardrails (repeat — these bite)

- **No "cloned from" anywhere.** Neutral references only.
- **Onboarding/qualification is irreversible** (`qms.qualification_audit_log` is append-only). Don't trial-onboard on prod.
- **Actor columns FK to `auth.users`, not `staff_users`** — resolve via `public.qms_resolve_actor(uuid)` before writing QMS rows.
- **Edge functions deploy `--no-verify-jwt`**; call via `supabase.functions.invoke` from the UI (never hand-rolled fetch).
- **Migrations:** apply to prod via MCP, then commit the `.sql` to `supabase/migrations/`.
- **Dry-run → proof one order → confirm → bulk.** Orders are deletable (not append-only) so a wrong test order can be removed — but verify before scaling.
- **Cethos is NOT ISO 17100 certified** (working toward it, Stage 2 target Dec 2026) — never imply certification in outward materials.

---

## 8. Reusable assets

- **Clone helper (installed in DB):** `clone_welo_coa_order(p_template_order, p_internal_project, p_client_project, p_target_lang, p_amount, p_po, p_pm_id, p_instr)` → returns `'ORD-… | <order_id>'`. Generalize/rename for RWS; drop it when done (`drop function clone_welo_coa_order(...)`).
- **Language UUIDs** (`languages.id`): English `fde091d2…` (the COA source), Danish `020b6c76…`, Dutch `a4af36f2…`, Dutch (Belgium) `be305a2e…`, English (Australia) `c96ad09a…`, English (Canada) `c511cc79…`, English (UK) `f76c3197…`, English (US) `fe7e0e4c…`, French `3f020964…`, French (Belgium) `4dac9901…`, French (Canada) `d99d9548…`, French (Switzerland) `339ca11f…`, German `32664bcc…`, German (Austria) `104fbb63…`, German (Switzerland) `76869055…`, Hungarian `6d6c9261…`, Italian `3274096c…`, Japanese `e8a9930c…`, Spanish (Argentina) `2894d841…`, Spanish (Latin America) `748bc575…`, Spanish (Mexico) `7eb707b3…`, Spanish (Spain) `356f22f3…`, Spanish (US) `77b720af…`, Turkish `9713aec7…`. (Look up any others from `languages`.)
- **Order graph (no `order_documents` on COA orders):** quote → order → `order_workflows` → `order_workflow_steps` (language lives on the steps' `target_language` text-UUID + the quote's `target_language_id`).
- **Welocalize precedent docs:** `docs/audits/2026-06-iqvia/` + prior-session memory entries.

---

## 9. First steps for the new session

1. Read `CLAUDE.md` + the project memory files + this handover.
2. Confirm with the user: **which RWS account** (USD-exempt vs CAD-taxable) for the work in scope, and whether RWS has a **portal** to log into (Chrome MCP) or it's email+Dropbox only.
3. **Phase 1:** enumerate RWS projects from Dropbox + Office 365 + portal → diff vs the 10 existing orders → present the missing list → confirm.
4. **Phase 2:** per confirmed project, create the order/workflow (right template, un-delivered shell, correct PM/currency/tax) — proof one, then bulk.
5. **Phase 3:** put the §6 feedback-logging decision to the user; implement the chosen option.
6. Verify on `portal.cethos.com`, update memory, PR-per-phase.

---

### Related open work (not RWS, but in flight)
- **Welocalize:** 13 missing tasks reconciled; **1 created** (ORD-2026-10486, P0498 Hungarian shell, verified), **12 remaining** await the user's go-ahead (P0498 ×6, P1331 Danish ×2, P0891 French-CA ×2, P1279 ×2). The `clone_welo_coa_order` helper + the 13-task list are ready to finish that batch.
