# Handover — 2026-05-21: Affidavit, Revision, Override

Scope of next session: lock in the **3-flow finalization model** (customer approval / customer revision / staff override) and ship **Phase A: English-only affidavit** end-to-end as the trigger for Step-3 auto-advance.

This builds on the draft-review work merged in the 2026-05-20 session (PRs #682–#699). The draft review pipe is live; what's missing is the certification step that fires *after* approval.

---

## 1. Current repo state (as of merge of #699)

Two repos, one Supabase project `lmzoyezvsjgsxveoakdr`:
- **Admin**: `D:\cethos\portal\cethos_app_figma_design_v1` (this repo)
- **Vendor**: `D:\cethos-vendor`

Main is at `082393a` — no uncommitted work, no open branches besides scratch worktrees under `.claude/worktrees/`.

### What's already wired

- **Draft translation table + lifecycle** (`draft_translations`): rows created by `promote-step-delivery-to-draft`, transitioned by `review-draft-file` with actions `submit_for_review` → `approve` | `request_changes` → `deliver_final`.
- **Customer-side draft view** filtered to latest pending only (#698), prior pendings auto-superseded on promote (#695).
- **Staff "View as customer" impersonation** (#697) via `customer_sessions` impersonation tokens (migration `20260521_customer_sessions_impersonation.sql`).
- **DRAFT watermark PDF** delivered to customer at draft stage; mark-final emits the clean PDF (#682, #690).
- **Workflow step card** shows QM job chip + version count (#679), Send-draft visibility fixed and QM close auto-approves delivery (#684).
- **Get-customer-dashboard** counters fixed (#699) — pending-review and revision-requested buckets now populate.

### What's missing for this work

- **No `certification_affidavit_templates` table.** This is the schema delta we're about to add.
- **No `apply-affidavit-and-finalize` edge function.** Step 3 (certification) currently sits idle after customer approval — staff have to manually progress it.
- **No `revision_round` / round-tracking** on `draft_translations`. Today, `request_changes` just flips status; we don't count rounds or constrain them. Decide in next session whether to track.
- **No staff "override approve" path.** `review-draft-file` action=`approve` requires `actor_type=customer` (or `actingAsStaff` flag for impersonation). True admin override that bypasses customer entirely doesn't exist as a first-class action.

---

## 2. This session's PRs (merged into admin/main)

Focused on the customer-facing draft review path so the certification step has a clean precondition.

| PR | Subject | Why it matters for next session |
|---|---|---|
| [#682](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/682) | mark-final + watermarked DRAFT PDF to customer | Establishes the "DRAFT → clean" PDF swap pattern the affidavit will hook into |
| [#684](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/684) | Send-draft visibility + QM close auto-approves delivery | QM-approved deliveries skip a manual step — affidavit handler must respect this |
| [#685](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/685) | Watermark centering + email/CC prefill | Email scaffolding reusable for certification-ready email |
| [#690](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/690) | Halve DRAFT watermark + teal re-brand | Visual baseline for the certified PDF too |
| [#694](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/694) | review-draft-file: correct `original_filename` column + `recipient_override` | The function is now stable enough to extend with an `override_approve` action |
| [#695](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/695) | Supersede prior pending drafts on promote-to-customer | Round-N drafts will rely on this — older pendings auto-clear |
| [#697](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/697) | "View as customer" staff impersonation | Lets staff approve *as* customer; distinct from a true override |
| [#698](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/698) | Customer portal shows only latest pending draft | Multi-round flow is now safe customer-side |
| [#699](https://github.com/ssraminder/cethos_app_figma_design_v1/pull/699) | Rewrite `get-customer-dashboard` — counters were zero | Counter buckets are correct, so we can add a "certification pending" tile later |

Memory updates from this session land in the same commit as the doc.

---

## 3. The 3-flow plan (locked, English-only affidavit scope)

Three terminal paths from "draft submitted to customer for review":

### Flow A — Customer approves
1. `review-draft-file` action=`approve`, actor=`customer`.
2. `draft_translations.review_status = 'approved'`.
3. **Auto-trigger** `apply-affidavit-and-finalize` (new) — see §4.
4. Step 3 (certification) advances to complete; final certified PDF emitted; customer notified.

### Flow B — Customer requests revision
1. `review-draft-file` action=`request_changes`, actor=`customer`, with `comment`.
2. `draft_translations.review_status = 'changes_requested'`.
3. Staff fixes; new step delivery promoted → new draft row (round N+1) supersedes old pending (#695).
4. Loop until customer approves (Flow A) or staff overrides (Flow C).
5. **Open**: do we cap rounds, log a `revision_round` int, or just count rows? Default to counting rows — no schema change unless we surface "round 3 of N" in UI.

### Flow C — Staff override (skip customer)
1. New action: `review-draft-file` action=`override_approve`, actor=`staff`, requires `override_reason` (free text, stored on the activity log).
2. `draft_translations.review_status = 'override_approved'` (new enum value, distinct from `approved`).
3. Same downstream trigger as Flow A → `apply-affidavit-and-finalize`.
4. Audit row written with `actor_type='staff'`, `action='override_approve'`, plus reason — ISO 17100 reproducibility intact.

**Distinction from #697 "View as customer":** impersonation = staff acts under the customer's identity (used when customer can't access portal). Override = staff acts under *their own* identity and bypasses customer review entirely (used when timeline forces a unilateral call). Both must be auditable and distinguishable in the activity log.

### Selection rule for affidavit template (Phase A)

```
target_language.code == 'en'  →  use english_only template (build now)
target_language.code != 'en'  →  use bilingual template (defer; placeholder)
```

Bilingual rows are seeded later — data migration only, no code change.

---

## 4. Schema delta (run on next session, with confirmation)

```sql
CREATE TABLE certification_affidavit_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_type TEXT NOT NULL,        -- e.g. 'translator_self', 'notarized'
  jurisdiction_province TEXT,              -- nullable = any; e.g. 'AB', 'ON'
  language_mode TEXT NOT NULL DEFAULT 'english_only'
    CHECK (language_mode IN ('english_only', 'bilingual')),
  body_template TEXT NOT NULL,             -- placeholder syntax: {{translator_name}}, {{date_long}}, {{source_language}}, {{target_language}}, {{page_count}}
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_affidavit_template_active
  ON certification_affidavit_templates (certification_type, jurisdiction_province, language_mode)
  WHERE is_active = true;
```

Migration file: `supabase/migrations/20260521_certification_affidavit_templates.sql`.

Seed one row: `certification_type='translator_self'`, `jurisdiction_province=NULL`, `language_mode='english_only'`, body containing the standard English affidavit text with placeholders.

**Reminder (from `feedback_soft_delete_needs_partial_unique`):** if soft-delete is added later, the unique index must use `WHERE deleted_at IS NULL` in addition to `is_active`.

---

## 5. New edge function: `apply-affidavit-and-finalize`

**Path:** `supabase/functions/apply-affidavit-and-finalize/index.ts`

**Inputs:** `{ order_id, draft_translation_id, triggered_by }` (triggered_by = `customer_approval` | `staff_override`)

**Behavior:**
1. Load order + target language + certification type.
2. Select template:
   - `language_mode = 'english_only'` if `target_language.code = 'en'`.
   - else `language_mode = 'bilingual'`.
3. **Fail loud** if no matching active row: return 422 with `{"error":"No bilingual affidavit template configured for target=Spanish","code":"AFFIDAVIT_TEMPLATE_MISSING"}`. Do **not** silently fall back to English on a non-English translation.
4. Render placeholders: translator name, ordinal English date ("6th day of February, 2026"), source/target language names, page count.
5. Generate certified PDF: clean translation + appended affidavit page, certified watermark/seal.
6. Upload to `quote-files` bucket under the certified path; write `step_deliveries` row of kind `certified`.
7. Email customer (re-use #685 prefill machinery; teal brand per #690).
8. Advance workflow step 3 → complete; write activity log.

**Deploy reminder (from `feedback_supabase_mcp_deploy_verify_jwt`):**
After `mcp__supabase__deploy_edge_function`, **always** follow with:
```powershell
supabase functions deploy apply-affidavit-and-finalize --no-verify-jwt --project-ref lmzoyezvsjgsxveoakdr
```
The MCP deploy flips `verify_jwt` to true and breaks invocation from the admin UI.

**Helper not needed yet:** the per-locale `formatDate(date, locale)` is deferred to Phase B (bilingual).

---

## 6. Frontend touchpoints

- **`review-draft-file` call sites** in admin UI — add `override_approve` button on the step card *next to* "View as customer". Confirmation modal demands a non-empty `override_reason`. Distinct icon/label so staff don't conflate it with impersonation.
- **Activity log rendering** — show `override_approve` events with reason, in red/teal accent so audit-readers see staff-unilateral decisions clearly.
- **Step 3 card** — on `AFFIDAVIT_TEMPLATE_MISSING` error, show an error chip with the error message; expose a "Override manually" affordance that lets staff upload a certification PDF directly (existing path) and mark step complete without invoking the renderer.

No customer-portal changes for Phase A (customer never sees the affidavit template — only the certified PDF).

---

## 7. Open decisions still on user

1. **Revision-round cap** — hard limit (e.g. 3) or unbounded with UI warning? Default: unbounded for now, surface count only.
2. **`override_approve` permission gate** — any staff, or only `manager_role` / specific user_role flag? Default: any authenticated staff, audit log carries identity. Revisit if abuse surfaces.
3. **Affidavit template content** — exact English boilerplate to seed. Default: pull from current manually-applied certifications (Atefeh + Raminder examples in Google Drive, ~3 variants) and pick the canonical one. Confirm before seeding.
4. **Bilingual Phase B trigger** — start when first non-English order hits the new path and fails loud, or pre-seed top 5 targets (es, fr, de, it, pt-BR) proactively? Default: pre-seed top 5 mirroring `decision_en_to_target_only.md` Tier-A list. Decide after Phase A goes live.
5. **Certified PDF storage path** — `quote-files/{order_id}/certified/{filename}` or a sibling `certified-deliveries` bucket? Default: stay in `quote-files` (matches #687 — vendor-deliveries bucket doesn't exist).

---

## 8. Files / functions / migrations next session will touch

**New:**
- `supabase/migrations/20260521_certification_affidavit_templates.sql`
- `supabase/functions/apply-affidavit-and-finalize/index.ts`

**Modify:**
- `supabase/functions/review-draft-file/index.ts` — add `override_approve` action; emit downstream trigger to affidavit handler on `approve` and `override_approve` both.
- `src/` admin step-card component (find: `Grep "Send-draft"` after pull) — add Override button + modal.
- `src/` activity-log renderer — handle new event type.
- `memory/decisions.md` — log the 3-flow model + fail-loud policy.
- `memory/preferences.md` — log "fail loud on missing template config" as a general pattern.

**Verify before recommending (per `feedback_check_existing_before_building`):**
- Confirm `step_deliveries` accepts a `kind='certified'` value (or whatever enum is in use) — `Grep "step_deliveries.*kind"` first.
- Confirm `draft_translations.review_status` is text vs enum before adding `override_approved` value.
- Confirm `target_languages.code` column name is `code` (vs `iso_code`); check the table.

**Cross-repo check:** no vendor-repo changes expected for Phase A. Confirm by grepping vendor repo for `certification` and `affidavit` at session start.

---

## 9. Session-start checklist

1. `git pull --ff-only` on `main` (admin repo) — per `feedback_pull_before_cross_repo_hotfix`.
2. Read `memory/MEMORY.md` and the four primary memory files.
3. Read this handover doc top to bottom.
4. Resolve the 5 open decisions in §7 with user before touching code.
5. Apply schema migration via MCP + commit SQL file (per CLAUDE.md migration rule).
6. Build + deploy edge function with `--no-verify-jwt` CLI follow-up.
7. Wire admin UI; verify in browser with preview tools before declaring done.

---

## 10. Addendum (2026-05-21, second pass)

Verified against production schema and the real reference affidavit `Mahinder Kaur_Ration Card.docx`. Corrects / extends §3–§5 above.

### 10.1 — Table-name correction

There is **no `draft_translations` table**. Drafts live on `quote_files` with `file_category_id` pointing to the `draft_translation` slug in `file_categories`. Lifecycle columns: `review_status`, `review_version`, `review_comment`, `reviewed_at`, `is_staff_created`, `deleted_at`. Throughout §3 and §5, wherever "draft_translations" is mentioned, substitute `quote_files WHERE file_category_id=(SELECT id FROM file_categories WHERE slug='draft_translation')`.

### 10.2 — Real `certification_type` values

Production orders use human-readable strings, not slug codes:
- `Oath Commissioner` (the only one in the seeded prod data so far)
- `Notary Public` (planned)
- Others TBD

Seed and lookup keys must match `orders.certification_type` exactly. The earlier draft schema in §4 (`certification_type='translator_self'`) does not exist in prod — use `'Oath Commissioner'` for the seed.

### 10.3 — Missing columns on `quote_files`

The affidavit pipeline needs three new columns on `quote_files` (add to the §4 migration):

```sql
ALTER TABLE quote_files
  ADD COLUMN source_step_delivery_id UUID REFERENCES step_deliveries(id) ON DELETE SET NULL,
  ADD COLUMN rendered_affidavit_text TEXT,  -- frozen at render time; ISO 17100 audit trail
  ADD COLUMN document_holder_name TEXT;     -- per-file: the person NAMED on the document (not the customer)
```

Backfill `source_step_delivery_id` best-effort from `staff_notes` regex (`Promoted from workflow step "X" v(\d+)`); leave NULL where it doesn't match — Phase A handles new approvals only.

### 10.4 — Extended template schema (replaces §4)

The minimal schema in §4 is missing several variables the real affidavit needs. Use this instead:

```sql
CREATE TABLE certification_affidavit_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_type TEXT NOT NULL,
  jurisdiction_province TEXT,
  jurisdiction_city TEXT,
  language_mode TEXT NOT NULL DEFAULT 'english_only'
    CHECK (language_mode IN ('english_only', 'bilingual')),
  heading TEXT NOT NULL DEFAULT 'AFFIDAVIT',
  body_template TEXT NOT NULL,
  commissioner_block_template TEXT NOT NULL,
  field_labels JSONB NOT NULL DEFAULT '{
    "dated": "Dated",
    "document_holder": "Name(s) on the document",
    "document_translated": "Document translated"
  }'::jsonb,
  include_translator_block BOOLEAN NOT NULL DEFAULT TRUE,
  include_company_block BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_staff_id UUID REFERENCES staff_users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX uq_affidavit_template_combo
  ON certification_affidavit_templates(certification_type, COALESCE(jurisdiction_province,''), language_mode)
  WHERE is_active = TRUE;
```

Seed:

```sql
INSERT INTO certification_affidavit_templates (
  certification_type, jurisdiction_province, jurisdiction_city, language_mode,
  body_template, commissioner_block_template
) VALUES (
  'Oath Commissioner', 'Alberta', 'Calgary', 'english_only',
  'I hereby certify that the {{source_language}} to {{target_language}} translation of the above-mentioned document(s), is accurate and true. The translated document and the photocopies of original document are attached to this affidavit.',
  'AFFIRMED before me at the City of {{commissioner_city}} in the Province of {{commissioner_province}} on this {{affidavit_day_ordinal}} day of {{affidavit_month_year}}'
);
```

### 10.5 — Full variable map (replaces §5 placeholders)

| Placeholder | Source | Notes |
|--|--|--|
| `{{affidavit_date}}` | `now()` in America/Edmonton, "DD Month YYYY" | "06 February 2026" |
| `{{document_holder_name}}` | `quote_files.document_holder_name` | **Not the customer.** Person named on the doc. Customer fills at upload OR staff sets in admin |
| `{{document_type}}` | `intended_uses.label` via `quotes.intended_use_id` | "Ration Card", "Driver's License" |
| `{{source_language}}` / `{{target_language}}` | `languages.name` via `quotes.source/target_language_id` | "Punjabi", "English" |
| `{{translator_full_name}}` | Vendor profile on Step 1's `step_deliveries.vendor_id` | "Maria Teresa David" |
| `{{translator_phone}}` / `{{translator_email}}` | Vendor profile | |
| `{{commissioner_city}}` / `{{commissioner_province}}` | Template row | "Calgary" / "Alberta" |
| `{{affidavit_day_ordinal}}` | English ordinal from `affidavit_date` | "6th", "21st", "1st" |
| `{{affidavit_month_year}}` | "February 2026" | |

Static branding (Cethos company block, GST, address) is embedded in the template body — not a variable.

`languages.code` is the right column for the `'en'` check (confirmed in schema). No `iso_code`.

### 10.6 — Real affidavit reference

From `Mahinder Kaur_Ration Card.docx` and `Mohinder Kaur_Ration Card_updated.docx` — both finalized Cethos translations from `C:\Users\RaminderShah\Dropbox\Projects Folder\4Sight Immigration\05-02-2026 Punjabi to English PUNAM BISHT\file preparation\`. Structure is identical; only data differs.

```
                              AFFIDAVIT

Dated: 06 February 2026
Name(s) on the document: Mahinder Kaur
Document translated: Ration Card

I hereby certify that the Punjabi to English translation of the
above-mentioned document(s), is accurate and true. The translated
document and the photocopies of original document are attached to
this affidavit.

[LEFT CELL]                          [RIGHT CELL]
Maria Teresa David                   AFFIRMED before me at the
Phone: (587) 600-0786                City of Calgary in the
Email: info@cethos.ca                Province of Alberta on this
                                     6th day of February 2026
Cethos Solutions, Inc.
(Corporate Member of CLIA)
Toll-free: (844) 280-1313
Phone: (587) 600-0786
Website: www.cethos.ca
E-mail: info@cethos.ca
421 7th Ave SW, Floor 30,
Calgary. AB. T2P 4K9. Canada.
GST: 78174 1533 RT0001
```

Page break → `[Translation — English]` heading → verbatim translated content (preserve as-is from the source `.docx`; do not reflow or restyle).

### 10.7 — DOCX rendering implementation note

Build the affidavit page programmatically with `docx-js` (esm.sh; works in Deno). **Don't** try to unpack/edit the source `.docx` XML from the edge function — too fragile.

Approach:
1. Build a fresh `Document` with the affidavit content as Section 1.
2. Unpack the source `.docx` via `JSZip`, extract the `<w:body>` children.
3. Splice them into the new document as Section 2 with `pageBreakBefore`.
4. Pack + return.

Reference: `anthropic-skills:docx` skill instructions (loadable in the next session) give the API surface. Use Arial 12pt, US Letter (12240×15840 DXA), 1-inch margins to match the reference docs.

### 10.8 — Affidavit production from a customer who is NOT the document holder

Common case: customer Anjali orders a translation of her mother Mahinder's ration card. The affidavit must say "Name(s) on the document: Mahinder Kaur", not "Anjali Sharma".

Today `quote_files` has no `document_holder_name`. Three places to capture it:
- **At upload time**: customer types it next to each uploaded source file (preferred — they know).
- **At quote review**: staff can set/correct it during the analysis pass.
- **In the affidavit override modal** (Phase C): admin can override at the last minute.

The column added in §10.3 supports all three.

### 10.9 — Bilingual deferred — fail-loud message

When `target_language.code != 'en'` and no `bilingual` row is active, `apply-affidavit-and-finalize` must return:

```json
{
  "error": "No bilingual affidavit template configured for target=Spanish",
  "code": "AFFIDAVIT_TEMPLATE_MISSING",
  "remediation": "Seed a bilingual template or use admin override on Step 3"
}
```

Step 3 card surfaces this with a red chip and an "Override manually" button (Phase C). Never silently emit an English-only affidavit on a non-English translation.

### 10.10 — Affidavit override modal (Phase C continued)

Beyond the generic step override, the affidavit specifically needs a dedicated override modal because the rendered text can have data errors (typo in customer name, wrong document type). Modal:

- Shows the resolved placeholder values + the rendered preview text.
- Each placeholder field is editable.
- "Apply" calls `apply-affidavit-and-finalize` with `override_affidavit_text` and/or `override_field_values`.
- Logs the override + the original values to `staff_activity_log`.

---

End of addendum.

