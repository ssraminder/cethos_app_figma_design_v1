# Cethos QMS — Foundations

**Status:** Living document. This is the canonical reference for the Cethos Quality Management System covering ISO 9001:2015 (without Design), ISO 17100:2015, ISO 18587:2017, ISO 18841:2018, and the Canadian National Standard Guide for Community Interpreting Services (NSGCIS). It is the source-of-truth for engineering decisions, the training spine for operational staff, and the artifact a future contributor reads first before touching any QMS code.

**Last updated:** 2026-04-28 — Phase 1 (vendor qualification schema) live and verified in `lmzoyezvsjgsxveoakdr` Supabase.

**Owner:** Raminder Shah ([raminder@cethos.com](mailto:raminder@cethos.com)) — Quality Management Representative.

---

## 1. How to use this document

Three audiences read it. The structure serves all three.

- **Engineers** building or extending the QMS read §3 (standards), §4 (architectural canon), §6 (decisions), §7 (schema reference), and §13 (working principles) before any change. Every QMS schema change must be justifiable against §4.
- **Operations staff** running qualification, re-qualification, NDA, and evidence workflows read §8 (workflows), §9 (auditor queries), §10 (roles), §11 (glossary). This document is the source material for the QMS training course. Slides and SOPs are derived from it; if they ever conflict, this document wins.
- **Auditors** (internal or Orion) read §3 (clause mapping), §7 (schema), §9 (queries), and §6 (decisions log) to test conformance. Every claim in this system maps back to a specific clause. Every change leaves an audit trail.

If you are about to make a change that doesn't fit cleanly into any of those three readings, stop and ask before writing code. The QMS is not a place for incidental refactoring.

---

## 2. Mission and certificate scope

Cethos Solutions Inc. is pursuing single integrated certification across five standards, conducted by Orion Assessment Services of Canada Inc. The Stage 2 audit target is **December 2026** (February 2027 fallback). The Orion application is submitted.

### 2.1 Certificate scope statement (canonical, from the Orion application)

> Provision of translation, post-editing of machine translation, and interpretation services for clients in Canada and globally, including certified translation, life sciences translation, business translation, and community interpretation, supported by project management, vendor qualification, and quality assurance processes.

### 2.2 In scope

Certified translation; life sciences translation; business translation; post-editing of machine-translated content; community interpretation in 95+ languages.

### 2.3 Out of scope (and why)

- **Design and Development (ISO 9001 §8.3 exclusion).** Cethos delivers based on client-provided source materials and client-defined specifications.
- **Commissioner of Oaths services** — separate business operating as calgaryoaths.com.
- **Apostille / document legalization.**

### 2.4 Operational scale (as of Phase 1 launch)

About twelve in-house FTE supporting 1,468 linguist records (749 active in `public.vendors`), of which 593 originated in the legacy XTRF migration. CAT tools standardly deployed: SDL Trados, MemoQ, Wordfast. Multi-step QA flow: translation → revision → proofreading.

---

## 3. Standards and clause map

This is the authoritative list of clauses every QMS record must trace back to. When you create a new QMS table, view, or workflow, you cite the clause it satisfies. Records without a clause have no defensible reason to exist.

### 3.1 ISO 9001:2015 — General quality management system

- **§4** Context of the organization (interested parties, scope, QMS processes).
- **§5** Leadership, policy, roles.
- **§6** Risk-based thinking, planning of changes.
- **§7** Resources, competence, awareness, communication, documented information.
- **§8.4** Control of externally provided processes, products, and services. **This is where vendor qualification lives at the ISO 9001 level.**
- **§9** Performance evaluation: monitoring, internal audit, management review.
- **§10** Improvement, nonconformity and corrective action.

### 3.2 ISO 17100:2015 — Translation Service Provider

The most-scrutinized standard for our business. Critical clauses:

- **§3.1.4** Translator competence — must meet **at least one** of:
  - **(a)** recognized degree in translation;
  - **(b)** recognized degree in any other field plus two years documented professional translation experience;
  - **(c)** five years documented professional translation experience.
- **§3.1.5** Reviser competence — translator competence per §3.1.4 plus revision experience plus relevant subject expertise.
- **§5.4** Confidentiality and information security (NDA lifecycle.)
- **§6.1** Human resources, professional competences and qualifications, records of qualifications, ongoing development.

### 3.3 ISO 18587:2017 — Post-editing of machine translation

- **§3.1** Post-editor competence — translator competence per ISO 17100 §3.1.4 **plus** training or documented experience in machine-translation post-editing.

### 3.4 ISO 18841:2018 — Interpreting services

- **§6** Interpreter competence — recognized interpreter training plus verified language proficiency in working languages, **or** five years documented professional interpreting experience as alternative.

### 3.5 NSGCIS — National Standard Guide for Community Interpreting Services (Canada)

Adds community-interpreting-specific competence beyond ISO 18841: cultural competence training, ethics training, mode-specific qualification (consecutive / simultaneous / sight / OPI / VRI), domain-specific qualification (healthcare / legal / social services / education / mental health). Modeled in `qms.interpreter_modes` (with `nsgcis_relevant` flag) and the `interpretation_domains` parent in `qms.subject_matters`.

---

## 4. Architectural canon

Six principles, written in the order they should resolve disputes. If two of these conflict in a specific situation, the earlier one wins.

### 4.1 Every record maps to a clause

The `qms.competence_bases` table is the spine. Every `role_qualifications` row points to exactly one competence basis. Every basis points to exactly one ISO clause. An auditor pulling SQL should be able to trace any qualified linguist back to an ISO clause and the verified evidence supporting that clause path. If you propose a QMS column, view, or table that does not satisfy a clause, the answer is no.

### 4.2 The QMS layer extends `public.vendors`. It does not duplicate it.

`public.vendors` is the canonical linguist record. The CVP pipeline (`cvp_*` tables) is a vetting program that feeds qualified candidates into the canonical record. The QMS schema (`qms.*`) is a thin conformance layer on top, with foreign keys back to `public.vendors(id)`. The QMS does **not** add columns to `public.vendors`. New columns there belong to the operational vendor record, not to ISO conformance.

### 4.3 Records-first design. Procedure documents prove what the records show, not the other way around.

The Phase 4 procedure documents describe what the system does. **The system is the proof.** An auditor pulling SQL is convinced; an auditor reading prose is skeptical. When designing any new QMS feature, ask "what record does this produce?" before "what UI does this need?" If the record is useless, the UI is theater.

### 4.4 Auditor-grade tamper resistance is non-negotiable.

The `qms.qualification_audit_log` is append-only at three layers: REVOKE on `UPDATE` / `DELETE` / `TRUNCATE` for every role, a `BEFORE UPDATE OR DELETE` trigger that raises `insufficient_privilege`, and a sha256 row-hash chain (`prev_hash` + `row_hash`) verifiable by `qms.verify_audit_log_integrity()`. The log records every status change automatically via triggers on `role_qualifications`, `competence_evidence`, `nda_agreements` — staff cannot forget to log because logging is not staff's responsibility.

### 4.5 Hard-enforce preconditions in the database, not the application.

`status='qualified'` requires:

- a `competence_basis_id` whose `role_type_code` matches the qualification's role,
- an explicit `qualified_by` (auth.uid() — UI must execute under an authenticated session),
- at least one `verified` non-expired `competence_evidence` row for the vendor,
- an `active` non-expired NDA on the vendor.

These are enforced by the `qms.enforce_qualification_preconditions()` trigger, governed by the `qms.config` flags `qualification_requires_verified_evidence` and `qualification_requires_active_nda` (both default `true`). Application code can build the UI around this trigger, not in front of it. Trying to qualify a vendor who fails preconditions raises an exception. This is intentional. An auditor asks "can I see a qualified vendor without verified evidence?" The honest answer is "the schema doesn't permit it."

### 4.6 Additive-only at the public-schema boundary.

Phase 1 and any future phase must be additive at the boundary with `public.vendors`, `public.vendor_language_pairs`, `public.languages`, and the `cvp_*` tables. The QMS owns nothing in those tables. The single exception in Phase 1: `cvp_translators.vendor_id uuid` was added as a nullable FK bridge, since the legacy email-match logic is unsafe and the auditor will ask how qualified linguists trace from CVP to canonical. Any future change to public-schema tables on QMS's behalf must be documented in §6 (Decision log) with rationale.

---

## 5. System overview

Three cooperating systems share the same Supabase database (`lmzoyezvsjgsxveoakdr`):

### 5.1 The canonical vendor record — `public.vendors`

1,468 linguist rows (749 `status='active'`, 719 `status='applicant'`). Holds identity, contact, country, languages (legacy jsonb columns), specializations, rates, payment, total project history. `auth_user_id` is currently zero across all rows — no linguists have logged in yet. This table is owned operationally by the vendor management team. The QMS reads from it but never writes to it.

### 5.2 The vetting pipeline — `cvp_*` tables

107 applications in `cvp_applications`, 63 tests in `cvp_test_library`, 730 test combinations, 1 graduate in `cvp_translators`. The Cethos Vetting Program is a real qualification pipeline — intake form, AI prescreening, language-pair × domain × service-type test combinations, AI-assessed submissions, reference checks, decisions. It does most of the work of a §3.1.4 path-(c) verification but doesn't currently tag the work to ISO clauses. **Throughput is the operational risk:** 107 → 1 since launch is a real timeline pressure for Stage 2 vendor capacity. That risk is operational, not architectural.

### 5.3 The conformance layer — `qms.*` schema (Phase 1, this document's subject)

Eighteen tables, eleven views, one materialized view, eight enums, thirteen functions, ten triggers, forty-six RLS policies, fifty-six indexes. Sits on top of `public.vendors` with FKs back to it. Layers ISO conformance metadata onto the operational vendor record. Provides the auditor-facing views in §9. Does not own linguist identity.

### 5.4 Bridge points between the three

- `qms.role_qualifications.vendor_id` → `public.vendors(id)` — every QMS qualification points at a canonical linguist.
- `qms.competence_evidence.source_cvp_application_id` and `source_cvp_test_submission_id` — when evidence comes from the CVP pipeline, the link is preserved.
- `public.cvp_translators.vendor_id` (added in Phase 1) — graduates can now point at a canonical vendor record. Email-match logic in existing edge functions remains as fallback during transition.
- `qms.language_code_aliases` — bridges the uppercase text codes used in `vendor_language_pairs` to the uuid-keyed `public.languages`. QMS itself FKs cleanly to `public.languages(id)`; the alias table exists so consumers reading `vendor_language_pairs` still resolve.

---

## 6. Decision log

Decisions made during Phase 1 design, with rationale. The format is: **decision** → **rationale** → **alternative considered, and why rejected**. New phases append to this log. Decisions are never overwritten — they are superseded with explicit cross-reference.

### D-001 Schema location: dedicated `qms` schema (not `iso_*` prefix in `public`)

A dedicated schema gives clean RLS scoping, single grant-target for an external auditor, and visual separation of conformance metadata from operational data. The `iso_*` prefix alternative was consistent with `cvp_*`, `xtrf_*`, `vendor_*` conventions in `public`, but lost on RLS clarity and future bucket grants. **Locked 2026-04-28.**

### D-002 Language code normalization: `qms.language_code_aliases` lookup, not `vendor_language_pairs` migration

The briefing initially preferred migrating `vendor_language_pairs` to FK `public.languages(id)`, but database introspection showed only 65.6% of source codes and 58.1% of target codes resolve case-insensitively to `public.languages` — the rest are locale variants `public.languages` simply doesn't have rows for (e.g., `EN-IN`, `FI-FI`, `EN-CB`, `PA-PA`). Migrating would require either adding ~50–80 new rows to `public.languages` (with locale-canonical-form decisions per row) or accepting base-language fallback (which loses the locale information that may matter for ISO scope). The alias table defers that decision without blocking Phase 1. The QMS itself FKs cleanly to `public.languages(id)` for `language_pair_qualifications`. The alias table seeds 141 rows from `public.languages` plus any case-insensitive matches from `vendor_language_pairs`. Unresolved codes (229 distinct, 3,963 occurrences) surface in `qms.v_unresolved_language_codes` for Phase 2 cleanup. **Locked 2026-04-28.**

### D-003 Default eligibility for the 1,468 existing vendors: all start ungated

No automatic creation of `qms.role_qualifications` rows for any existing vendor on Phase 1 launch. From an ISO 17100 §3.1.4 perspective, every existing vendor is currently unqualified — none have documented competence on file (zero rows have `certifications` jsonb populated, zero have `native_languages` populated). Auto-qualifying them retroactively without evidence would defeat the system. The 260 vendors with `total_projects > 0` surface in `qms.v_retroactive_qualification_candidates` as a deliberate workflow target. The vendor_type column was considered as a discriminator but only 12 of 1,468 rows have it set, so it is unusable for this purpose. **Locked 2026-04-28.**

### D-004 `cvp_translators` ↔ `vendors` bridge: add nullable `vendor_id` FK in Phase 1

`cvp_translators` had no FK to `vendors`. Existing edge functions (`cvp-get-my-domains`, `vendor-update-profile`, `VendorDomainsTab`) bridge by email match in 8+ call sites. Email match is fragile if email changes; an auditor will ask how a CVP graduate is linked to a canonical linguist. Adding `vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL` is cheap (1 row in `cvp_translators`, 0 with `auth_user_id` to backfill from). Existing email-match logic stays as fallback during transition. **Locked 2026-04-28.**

### D-005 Default re-qualification cadence: 12 months, governed by `qms.config`

ISO 17100 implies but does not mandate annual review. Putting the cadence in `qms.config` (key `re_qualification_interval_months`, default `12`) gives auditable governance: the auditor asks "what cadence does your QMS enforce?" and the answer is a row in `qms.config`, not "we try to do it yearly." The trigger `enforce_qualification_preconditions()` reads this value and stamps `re_qualification_due` automatically on initial qualification. **Locked 2026-04-28.**

### D-006 NDA renewal cadence default: 60 months. Active NDA required for `status='qualified'`.

Default in `qms.config` (`nda_renewal_interval_months = 60`). Active NDA requirement is a config flag (`qualification_requires_active_nda = true`) — auditable governance, not hard-coded behavior. **Locked 2026-04-28.**

### D-007 Audit log tamper resistance: three layers (REVOKE + trigger + hash chain)

REVOKE alone protects against application code. Trigger alone protects if REVOKE is mistakenly granted back. Hash chain alone is verifiable but not preventive. Combining all three means an attacker has to bypass three independent mechanisms. The chain uses sha256 with `extensions.digest()` (Supabase places pgcrypto in `extensions` schema). The verifier `qms.verify_audit_log_integrity()` walks the chain row by row — auditor runs it to prove integrity. **Locked 2026-04-28.**

### D-008 QMS roles modeled as `qms.role_assignments` table, not `staff_users` columns

Five conceptual roles (qms_admin, qms_vendor_manager, qms_project_manager, qms_auditor, plus implicit linguist via `vendors.auth_user_id`). Modeling them as a separate assignment table (with `expires_at` for time-bound auditor access) avoids touching `staff_users`, supports multiple QMS roles per user, and lets us grant auditor access by adding a row rather than schema migration. The helper `qms.has_qms_role(text)` is `STABLE SECURITY DEFINER` and is the only way RLS policies ask the question. **Locked 2026-04-28.**

### D-009 Storage bucket `qms-evidence` is private, with vendor-self-folder upload policy

Path convention: `qms-evidence/{vendor_id}/{evidence|nda}/{file_id}-{slug}.{ext}`. Bucket is private; signed URL issuance via edge function deferred to Phase 2. Vendors can upload to their own `{vendor_id}` folder via storage RLS. Staff can read everything. 100MB file size limit, allowlisted MIME types (PDF, common image formats, DOC/DOCX, XLS/XLSX, plain text). **Locked 2026-04-28.**

### D-010 Phase 1 ends at "schema live, seeded, verified, documented." No UI in this phase.

UI work would expand scope and delay validation. The schema is testable through SQL alone. A working UI is a Phase 2 deliverable. **Locked 2026-04-28.**

### Open / deferred decisions

- **D-OPEN-1** Refresh schedule for `qms.linguist_performance_snapshot` — deferred to Phase 2 (needs pg_cron).
- **D-OPEN-2** Edge function `qms-evidence-fetch` for signed URL issuance — deferred to Phase 2.
- **D-OPEN-3** Auto-creation of role_qualification rows for the 260 retroactive candidates from `v_retroactive_qualification_candidates` — deferred. Each candidate goes through deliberate workflow with evidence verification before qualification.
- **D-OPEN-4** `vendor_language_pairs` text-code → uuid migration — deferred indefinitely. Alias table is the durable answer unless `public.languages` is expanded.
- **D-OPEN-5** Removal of the false "ISO 17100 and ISO 9001 compliant processes" claim from cethos.com homepage — required before audit, but is a marketing-team task tracked separately.

---

## 7. Phase 1 schema reference

This section is the engineering reference. Read it before changing anything in `qms.*`.

### 7.1 Enum types

| Type | Values |
|---|---|
| `qms.qualification_status` | `under_review`, `qualified`, `suspended`, `expired`, `withdrawn` |
| `qms.pair_direction` | `source_to_target`, `both_directions` |
| `qms.proficiency_level` | `familiar`, `experienced`, `specialist` |
| `qms.nda_status` | `active`, `expired`, `superseded`, `revoked` |
| `qms.audit_action` | `applied`, `submitted_for_review`, `qualified`, `re_qualified`, `suspended`, `reinstated`, `withdrawn`, `offboarded`, `archived`, `evidence_added`, `evidence_verified`, `evidence_superseded`, `nda_signed`, `nda_renewed`, `nda_revoked`, `performance_flag`, `config_changed` |
| `qms.performance_event_type` | `project_completed`, `revision_finding`, `client_complaint`, `client_compliment`, `late_delivery`, `quality_issue`, `capa_action_opened`, `capa_action_closed` |
| `qms.severity` | `low`, `medium`, `high`, `critical` |
| `qms.qms_role` | `qms_admin`, `qms_vendor_manager`, `qms_project_manager`, `qms_auditor` |

### 7.2 Reference tables (seeded)

- `qms.role_types` (4 rows): `translator`, `reviser`, `post_editor`, `interpreter`. Each carries `iso_clause_reference`.
- `qms.competence_bases` (7 rows): the seven enumerated competence pathways from §3. Spine of audit traceability.
- `qms.evidence_types` (16 rows): degree (translation), degree (other), documented translation experience, documented interpretation experience, MT post-editing training, interpreter training certificate, mode-specific certification, domain-specific certification, language proficiency test, professional membership, CPD, background check, references verified, internal test passed, cultural competence training, ethics training. Each carries `iso_clause_reference` and `applies_to_roles[]`.
- `qms.subject_matters` (32 rows, two levels): Legal, Life Sciences / Medical, Business / Financial, Technical, Government / Public Sector, Interpretation Domains (NSGCIS) — each with subdomains.
- `qms.interpreter_modes` (6 rows): consecutive, simultaneous, sight translation, whispered, OPI, VRI. NSGCIS-relevant flag distinguishes community interpreting modes.

### 7.3 Governance tables

- `qms.config` (6 keys): `re_qualification_interval_months=12`, `nda_renewal_interval_months=60`, `evidence_verification_sla_days=14`, `cpd_minimum_hours_annual=20`, `qualification_requires_active_nda=true`, `qualification_requires_verified_evidence=true`. Auditor-readable, admin-writable. Updates auto-log via trigger (deferred — see §13.5).
- `qms.policy_versions` (skeleton): versioned QMS procedure documents. Populated in Phase 4. Lets any qualification decision cite the procedure version in force at decision time.
- `qms.role_assignments`: maps `auth.users.id` → `qms.qms_role`. `expires_at` enables time-bound auditor access. Currently one row: raminder@cethos.com as `qms_admin`.

### 7.4 Core qualification tables

- **`qms.role_qualifications`** — heart of the system. One row per (vendor, role). Carries `competence_basis_id`, `status`, `qualified_at/by`, `last_re_qualified_at`, `re_qualification_due`, `competence_basis_notes`, `suspended_at/reason`, `withdrawn_at/reason`, `policy_version_id`, `internal_notes`. Unique on (vendor_id, role_type_id).
- **`qms.competence_evidence`** — verified credentials. `verified` boolean plus `verified_by/at/method/notes`. Storage path + sha256 hash. Optional `superseded_by` for evidence renewal. Optional `source_cvp_application_id` and `source_cvp_test_submission_id` for CVP-derived evidence.
- **`qms.subject_matter_qualifications`** — per (role_qualification_id, subject_matter_id) with proficiency level.
- **`qms.interpreter_mode_qualifications`** — per (role_qualification_id, mode_id), used only when role_type is interpreter.
- **`qms.language_pair_qualifications`** — per (role_qualification_id × source × target language) FK to `public.languages(id)`. Direction enum.
- **`qms.professional_experience`** — for §3.1.4(b), §3.1.4(c), and §6 alternative paths. Per (vendor × role) with employer, start/end dates, volume_indicator, is_documented, evidence link.
- **`qms.nda_agreements`** — confidentiality lifecycle. Partial unique on `(vendor_id) WHERE status='active'`. Storage path. Countersignature tracking. Supersession chain.
- **`qms.qualification_audit_log`** — append-only. Hash-chained. Three layers of tamper resistance (see §4.4).
- **`qms.performance_events`** — granular feed for re-qualification triggers.
- **`qms.linguist_performance_snapshot`** (materialized view) — rollup of performance events. Refresh schedule deferred to Phase 2.

### 7.5 Helper functions

| Function | Purpose |
|---|---|
| `qms.has_qms_role(qms.qms_role)` | Check current auth.uid() against `role_assignments`, respecting `expires_at`. |
| `qms.is_qms_admin()` | Shorthand for `has_qms_role('qms_admin')`. |
| `qms.is_qms_staff()` | Shorthand: admin OR vendor_manager OR project_manager. |
| `qms.current_vendor_id()` | Returns the `vendors.id` whose `auth_user_id = auth.uid()`. |
| `qms.resolve_language(text)` | Looks up alias_code in `language_code_aliases`, falls back to case-insensitive `languages.code` match. |
| `qms.verify_audit_log_integrity()` | Walks the audit log hash chain row by row. Returns `(ok, rows_checked, first_bad_id, message)`. |

### 7.6 Triggers

| Trigger | Purpose |
|---|---|
| `trg_audit_log_hash_chain` | BEFORE INSERT on `qualification_audit_log`. Computes `prev_hash` and `row_hash`. |
| `trg_audit_log_no_update` / `trg_audit_log_no_delete` | BEFORE UPDATE / DELETE on `qualification_audit_log`. Raises `insufficient_privilege`. |
| `trg_role_qualifications_preconditions` | BEFORE INSERT OR UPDATE on `role_qualifications`. Enforces clause-mapping, evidence, NDA, default `re_qualification_due`. |
| `trg_role_qualifications_audit` / `trg_competence_evidence_audit` / `trg_nda_agreements_audit` | AFTER INSERT/UPDATE. Auto-write to `qualification_audit_log`. |
| `trg_*_touch` (3 tables) | BEFORE UPDATE. Update `updated_at` and `updated_by`. |

### 7.7 RLS policies (46 total, 17 tables)

Grouped by role:

- **qms_admin** — full read/write on every `qms.*` table. Only role that can write `role_assignments`, `config`, `policy_versions`.
- **qms_vendor_manager** — qualification authority. Insert/update on `role_qualifications`, `competence_evidence`, sub-qualifications, `professional_experience`, `nda_agreements`, `language_code_aliases`, `performance_events`. Insert (not update/delete) on `qualification_audit_log` (delegated to triggers). Cannot touch `config` or `role_assignments`.
- **qms_project_manager** — read-only on qualified vendors and qualifications. Cannot read `internal_notes` (handled at view layer in Phase 2 UI).
- **qms_auditor** — read-only on every `qms.*` table including audit log. Time-bounded via `role_assignments.expires_at`.
- **linguist (vendor)** — sees only their own `vendors` row's QMS records. Matched via `qms.current_vendor_id()`. Can insert evidence (verified=false). Cannot self-verify.

### 7.8 Storage

Single bucket `qms-evidence`, private. Path convention `qms-evidence/{vendor_id}/{evidence|nda}/{file_id}-{slug}.{ext}`. Storage RLS: staff full read/write, vendors read+upload only within their own `{vendor_id}` folder. Signed URL issuance via edge function deferred to Phase 2.

---

## 8. Operational workflows

These are the workflows the operations team executes. Each one corresponds to a sequence of database operations that the QMS schema mediates and the audit log records.

### 8.1 Initial qualification of a new linguist

1. Linguist completes CVP intake; data lands in `cvp_applications`.
2. CVP screens, tests, and decides. On approval, `cvp_translators` row is created, `cvp_translator_domains` rows record per-pair-per-domain approvals.
3. Vendor management creates a `public.vendors` row (or links existing) and sets `cvp_translators.vendor_id`.
4. Vendor management creates `qms.competence_evidence` rows from CVP-collected documents (degree certificates, training certificates, references). Each is verified by the qualification authority (`verified=true`, `verified_by`, `verified_at`, `verification_method`).
5. NDA is signed; `qms.nda_agreements` row created with `status='active'`.
6. Vendor management inserts `qms.role_qualifications` row with the appropriate `competence_basis_id` and `status='qualified'`. The trigger validates: basis-role match, qualified_by present, ≥1 verified non-expired evidence row, active non-expired NDA. Trigger stamps `re_qualification_due` from `qms.config`.
7. Vendor management adds `qms.language_pair_qualifications`, `qms.subject_matter_qualifications`, and (for interpreters) `qms.interpreter_mode_qualifications` rows.
8. Audit log records the `qualified` action automatically via trigger.

If any precondition fails at step 6, the system rejects the qualification with a clear error. Fix the missing precondition; do not bypass.

### 8.2 Periodic re-qualification

1. `qms.v_re_qualification_due` surfaces qualifications due in the next 30 days.
2. Vendor management collects updated evidence (CPD records, renewed certifications, refreshed references) and inserts new `qms.competence_evidence` rows. Old evidence may be marked `superseded_by` the new row.
3. Vendor management updates `role_qualifications.last_re_qualified_at = now()` and `re_qualification_due = now() + interval '12 months'` (or whatever `qms.config.re_qualification_interval_months` is at decision time).
4. Audit log records the `re_qualified` action automatically.

### 8.3 Suspension

Triggered by performance events, complaint, or NDA breach. Set `status='suspended'`, populate `suspended_at` and `suspension_reason`. Audit log captures the transition. Linguist is gated out of certified-project assignment immediately because `v_qualified_*` views filter on `status='qualified'`.

### 8.4 Withdrawal / offboarding

Linguist no longer working with Cethos. Set `status='withdrawn'`, `withdrawn_at`, `withdrawn_reason`. Active NDA usually moves to `status='expired'` or stays per its expiry terms. Records remain — they are evidence of historical qualification at the time projects were assigned.

### 8.5 Evidence expiry handling

`qms.v_evidence_expiring_soon` surfaces evidence expiring in 60 days. Vendor management requests renewal from the linguist. New evidence row is inserted; old row's `superseded_by` is set. If no replacement is uploaded by expiry, qualification dependent on that evidence may need to be moved to `under_review` until resolved.

### 8.6 NDA renewal

`qms.v_nda_expiring_soon` surfaces NDAs expiring in 60 days. New NDA is signed, inserted with `status='active'`; old NDA's `superseded_by` is set and its `status` moved to `superseded`. A vendor may have at most one active NDA (partial unique index enforces this).

### 8.7 Adding an auditor

`qms_admin` inserts a row into `qms.role_assignments` for the auditor's `auth.users.id` with `qms_role='qms_auditor'` and `expires_at` set to the audit window's close date plus a buffer. The auditor reads `qms.*` views and tables; cannot mutate. After the audit, the row's `expires_at` naturally restricts further access — no follow-up action required.

---

## 9. Auditor query patterns

The decisive demonstrations. Each view is auditor-runnable.

### 9.1 Qualified translators by language pair and subject (the §7.9 query from the briefing)

```sql
SELECT *
FROM qms.v_qualified_translators_by_pair_and_subject
WHERE source_language_code IN ('es','es-ES','es-MX','es-LA')
  AND target_language_code IN ('en','en-US','en-CA','en-GB')
  AND subject_matter_parent_code = 'life_sciences';
```

### 9.2 Analogous views for other roles

- `qms.v_qualified_revisers_by_pair_and_subject`
- `qms.v_qualified_post_editors_by_pair_and_subject`
- `qms.v_qualified_interpreters_by_mode_and_domain`

### 9.3 Operational alerts the QMS uses to drive workflow

- `qms.v_evidence_expiring_soon` — next 60 days
- `qms.v_re_qualification_due` — next 30 days
- `qms.v_nda_expiring_soon` — next 60 days

### 9.4 Per-vendor summary (admin UI primary view)

```sql
SELECT * FROM qms.v_qualification_summary WHERE vendor_id = $1;
```

Shows qualified roles, under_review roles, suspended roles, active verified evidence count, active NDA flag, NDA next expiry, next re-qualification due.

### 9.5 Audit log integrity check

```sql
SELECT * FROM qms.verify_audit_log_integrity();
-- Expected: ok=true, rows_checked=N, first_bad_id=NULL, message='OK N rows verified.'
```

Run before every internal audit and at the start of every external audit window.

### 9.6 Scope-of-evidence trace for any qualified linguist

```sql
SELECT
  rq.id, v.full_name, rt.code AS role,
  cb.iso_clause_reference, cb.short_label,
  array_agg(DISTINCT et.code) AS evidence_types,
  array_agg(DISTINCT ce.title) AS evidence_titles,
  bool_and(ce.verified) AS all_evidence_verified,
  nda.signed_date AS nda_signed, nda.expiry_date AS nda_expires
FROM qms.role_qualifications rq
JOIN public.vendors v ON v.id = rq.vendor_id
JOIN qms.role_types rt ON rt.id = rq.role_type_id
JOIN qms.competence_bases cb ON cb.id = rq.competence_basis_id
LEFT JOIN qms.competence_evidence ce ON ce.role_qualification_id = rq.id AND ce.verified = true
LEFT JOIN qms.evidence_types et ON et.id = ce.evidence_type_id
LEFT JOIN qms.nda_agreements nda ON nda.vendor_id = v.id AND nda.status = 'active'
WHERE rq.id = $1
GROUP BY rq.id, v.full_name, rt.code, cb.iso_clause_reference, cb.short_label, nda.signed_date, nda.expiry_date;
```

---

## 10. Roles and responsibilities (RACI)

| Activity | qms_admin | qms_vendor_manager | qms_project_manager | qms_auditor | linguist |
|---|---|---|---|---|---|
| Define QMS scope, policies | A/R | C | I | I | I |
| Edit `qms.config` (cadences, flags) | A/R | C | I | I | I |
| Create / edit `qms.role_assignments` | A/R | I | I | I | I |
| Approve `competence_evidence.verified=true` | A | R | I | I | I |
| Insert `role_qualifications.status='qualified'` | A | R | I | I | I |
| Suspend / withdraw a role qualification | A | R | C | I | I |
| Add NDA, mark renewed | A | R | I | I | I |
| Read all qualifications + audit log | A | R | R (no internal_notes) | R | R (own only) |
| Run `verify_audit_log_integrity()` | A | R | R | R | – |
| Edit reference taxonomies (role_types, competence_bases, evidence_types, subject_matters, interpreter_modes) | A/R | I | I | I | I |
| Maintain `qms.policy_versions` | A/R | C | I | I | I |
| Upload own evidence | I | A | I | I | R |
| Manage workflow gating in operational systems | C | A/R | C | I | I |

R=responsible, A=accountable, C=consulted, I=informed. Per ISO 9001 §5, accountability for the QMS sits with the QMR (qms_admin role-holder).

---

## 11. Glossary

- **Competence basis** — the specific ISO clause path under which a linguist is qualified (e.g., ISO 17100 §3.1.4(b) — degree in another field plus 2 years experience). Stored in `qms.competence_bases`. Every qualified `role_qualifications` row points at exactly one.
- **CVP** — Cethos Vetting Program. The end-to-end pipeline (`cvp_*` tables) that recruits, screens, tests, and approves linguist candidates.
- **Evidence** — verifiable documentation supporting a competence claim. Diploma, training certificate, employer letter, references, internal test result. Modeled in `qms.competence_evidence`. `verified=true` requires identified verifier and method.
- **NDA** — non-disclosure agreement. Required active before status can be `qualified` (per `qms.config.qualification_requires_active_nda`).
- **Role type** — translator, reviser, post-editor, interpreter. Different role types map to different ISO competence clauses.
- **Role qualification** — one (vendor, role) pair with status, basis, evidence linkage. The atomic unit of "who can be assigned to what."
- **Subject matter** — domain expertise tag (life sciences, legal, etc.). Hierarchical, two levels.
- **Re-qualification** — periodic re-affirmation that a qualified linguist remains qualified. Triggered by `re_qualification_due` date.
- **Auditor** (qms_auditor role) — external (Orion or successor body) or internal auditor with read-only access to `qms.*` for a bounded time window.
- **Quality Management Representative (QMR)** — the qms_admin role-holder. Accountable for QMS effectiveness per ISO 9001 §5.

---

## 12. Phase roadmap

This phase delivered the schema. Subsequent phases:

- **Phase 2** — UI for qualification workflows, edge function `qms-evidence-fetch` for signed URLs, `pg_cron` job to refresh `linguist_performance_snapshot` and to flag expiring evidence/NDA/re-qualifications proactively. Auditor login flow with time-bounded JWT.
- **Phase 3** — Wiring of project assignment to QMS gating: a project manager assigning a linguist to an ISO-scoped order looks up `v_qualified_*` views, not `vendors` directly. CVP graduates auto-create `role_qualifications` skeletons with `status='under_review'` upon `cvp_translators` insert.
- **Phase 4** — QMS procedure documents (controlled documents with version stamps in `qms.policy_versions`): the Quality Manual, Vendor Qualification Procedure, NDA Procedure, Evidence Verification Procedure, Re-qualification Procedure, Internal Audit Procedure, Management Review Procedure, Nonconformity & CAPA Procedure, Records Control Procedure.
- **Phase 5** — Project-side QMS records: project intake, agreed specifications, translator/reviser/post-editor/interpreter assignment with QMS-trace (which qualified them, under what basis, evidence reference at assignment time), QA records (revision findings, proofreading sign-off), client feedback, delivery confirmation. Performance events feed back into `qms.performance_events`.
- **Phase 6** — In-house staff training records (separate from linguist qualification — uses the existing `cvp_trainings` infrastructure as the substrate), competence matrix for in-house roles.
- **Phase 7** — Internal audit checklists, audit findings, corrective actions, management review templates. Both as data tables and as procedure document outputs.
- **Phase 8** — Stage 1 readiness review with Orion, Stage 2 audit, surveillance audits.

---

## 13. Working principles for future contributors

When you make a change, follow these in order. Earlier rules trump later ones.

### 13.1 Read this document first.

Every change starts with reading §3 (clause map), §4 (architectural canon), §6 (decision log). If your proposed change is inconsistent with §4, you are wrong. If it is inconsistent with a decision in §6, supersede the decision explicitly with rationale; do not silently override.

### 13.2 Map every change to a clause.

A new column, table, or workflow exists because some ISO clause requires it or audits demand it. State the clause when you propose the change.

### 13.3 Keep the QMS schema additive at the public-schema boundary.

You can change anything in `qms.*`. Touching `public.vendors`, `public.vendor_language_pairs`, `public.languages`, or `cvp_*` requires explicit decision-log entry and §4.6 review.

### 13.4 Trigger-enforce, don't application-enforce, anything an auditor will care about.

Preconditions, append-only constraints, hash chains, role transitions, audit log writes. The auditor pulls SQL, not your TypeScript.

### 13.5 Auto-log on writes, don't ask staff to remember.

Triggers on `role_qualifications`, `competence_evidence`, `nda_agreements` already write to the audit log. When you add a new write surface (e.g., `qms.config` updates, `qms.policy_versions` edits), add a trigger that writes a `config_changed` audit row. This is technically deferred — Phase 2 will add `config` and `policy_versions` audit triggers.

### 13.6 New reference taxonomies seed in the same migration as the table.

Lookup tables are useless empty. If you create `qms.something_types`, you also seed it.

### 13.7 Functions get explicit `search_path`.

Supabase advisor `0011 function_search_path_mutable` is real — auditor will flag mutable search paths as a security issue. All `qms.*` functions are pinned to `qms, public` (or `qms, public, extensions` when calling pgcrypto).

### 13.8 RLS-policy every new table immediately.

Every new `qms.*` table needs `ENABLE ROW LEVEL SECURITY` and policies for the five role classes (admin, vendor_manager, project_manager, auditor, linguist) in the same migration.

### 13.9 Document the change in this file.

If your change introduces a new decision, add an entry to §6 with rationale and superseded alternatives. If it changes the schema reference, update §7. If it changes a workflow, update §8.

### 13.10 No feature flags or backwards compatibility shims.

`qms.config` is the place for governed parameters that can change. Code paths should not branch on "old QMS vs new QMS" — there is one QMS, and migrations advance it.

---

## 14. Phase 1 verification snapshot (2026-04-28)

Captured at Phase 1 sign-off for traceability:

- **Schema inventory:** 18 tables, 11 views, 1 materialized view, 8 enums, 13 functions, 10 triggers, 46 RLS policies, 56 indexes.
- **Seeds:** 4 role types, 7 competence bases, 16 evidence types, 32 subject matters (6 L1 + 26 L2), 6 interpreter modes, 6 config keys, 1 role assignment (raminder@cethos.com as qms_admin), 141 language code aliases.
- **Bridge:** `cvp_translators.vendor_id uuid` added (nullable, indexed).
- **Storage:** `qms-evidence` bucket private, 100 MB cap, MIME allowlist.
- **Audit log integrity:** `qms.verify_audit_log_integrity()` returned `OK 2 rows verified` after synthetic test inserts. Tamper test confirmed UPDATE and DELETE both blocked at trigger layer (REVOKE additionally restricts authenticated role).
- **Preconditions trigger:** insert of `role_qualifications.status='qualified'` against a real vendor with no evidence and no NDA was rejected, no row created.
- **Retroactive candidates view:** returns 260 vendors with `total_projects > 0` and no QMS qualification yet — matches expectation.
- **Unresolved language codes:** 229 distinct, 3,963 occurrences. Surface in `qms.v_unresolved_language_codes` for Phase 2 cleanup. Not blocking Phase 1.
- **Security advisors (qms.* scope):** 0 findings after function `search_path` fixes. Pre-existing 415 advisors across `public` are out of Phase 1 scope.
- **Test rows in audit log:** ids 1–4 are synthetic Phase 1 verification rows. They cannot be deleted by design — they are evidence of the tamper protection working. Marked clearly with `reason LIKE 'qms phase 1 verification%'`.

Migrations applied:

- `qms_phase1_01_schema_enums_reference`
- `qms_phase1_02_core_qualification_tables`
- `qms_phase1_03_audit_log_and_performance`
- `qms_phase1_04_language_aliases_and_cvp_bridge`
- `qms_phase1_05_auditor_views`
- `qms_phase1_06_rls_and_grants`
- `qms_phase1_07_fix_digest_search_path` (hotfix)
- `qms_phase1_08_fix_function_search_paths` (hotfix)

---

## 15. Pointers to other artifacts

- The original briefing document for this implementation is preserved as the source of intent. This document is the operational and engineering successor; if they conflict, this document wins.
- The earlier `cethos-qms-vendor-qualification-schema-v0.1.md` is **superseded**. Do not reference it for current work — it predates database introspection and proposed a parallel `qms.linguists` table, which we explicitly rejected (see §4.2 and D-001).
- The Phase 4 procedure documents (Quality Manual, Vendor Qualification Procedure, etc.) will land in `docs/qms/procedures/` and will reference back to specific sections of this document. The records this system produces are the proof those procedures are followed.
