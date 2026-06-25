# Staff Interactive-Training — Rollout Plan

**Created:** 2026-06-25 · **Goal:** turn download-only Documents & Manuals into **interactive, assignable, signed-off training** with annotated screenshots and a completion audit log. Builds on the **existing** engine: `training_modules → training_lessons → training_slides` (each slide has `body_text` + `screenshot_url`), `staff_training_progress` (completion audit), `training_modules.is_required` + `passing_score`, and an assignment table (`*_training_assignments`: staff_user_id · assigned_by · due_at · completed_at).

## 1. Two content patterns
- **A — Interactive step-by-step module** (for *process* SOPs/guides): each procedure step = one **slide** with `body_text` + one **annotated screenshot**; optional end-of-module quiz; **completion = sign-off**. This is what the RWS guides become.
- **B — Read-and-acknowledge** (for *policies*): one module that presents the controlled document; staff read it and tick an **attestation** ("I have read and understood"); recorded as a completion. No step screenshots needed.

> **Keep both formats:** the interactive module is the *trainable/assignable/signed-off* version; the **`.docx` stays in Documents & Manuals as the controlled, printable, audit-binder copy.**

## 2. The small gaps to add (one build, applies to everything)
1. **Per-staff assignment of `training_modules`** + an **"Assign / Share"** button (confirm the existing assignment table drives modules, else add `training_module_assignments`).
2. **Sign-off attestation** on completion (a tick + timestamp + name) — strengthens `completed_at`.
3. **Admin completion-audit view** — "who has completed which module, when, score" — read straight from `staff_training_progress` (+ assignment due dates) into one table, exportable for IQVIA.

The interactive rendering, slides, screenshots, progress tracking, quizzes, and required/passing-score already exist — these three are the only additions.

## 3. Pilot (now → completed during Fayza's validation dry-run)
| Source doc | Becomes | Pattern | Assigned to |
|---|---|---|---|
| **TRN-RWS-001** (onboarding guide) | "RWS LV Onboarding" module | A | LV / PM staff |
| **VAL-LV-001** (validation script) | "RWS LV Validation" module | A | **Fayza** (the tester) |

Screenshots are captured **during Fayza's VAL-LV-001 dry-run** (she's on every screen anyway), annotated, and attached to the slides — so we don't do that walk twice.

## 4. Prioritised rollout (after the pilot proves the flow)

**Tier 1 — Interactive step-by-step modules (Pattern A; highest training value):**
| Doc | Module | Required for |
|---|---|---|
| SOP-LV-001 + SOP-PR-003…011 | LV step procedures (one module, lessons per step) | LV operations / PM staff |
| SOP-VM-001 | Linguist qualification pipeline | Vendor-management staff |
| SOP-OPS-001 | Front-desk escalations | Ops / front-desk staff |
| SOP-PR-001 / -002 | Cognitive debriefing / Clinician review | LV staff handling those steps |

**Tier 2 — Read-and-acknowledge (Pattern B; all staff, annual refresh):**
| Doc | Module |
|---|---|
| QP-001 Quality Policy · QM-001 Quality Manual · QM-002 List of SOPs | Core QMS awareness |
| CTS-POL-005 (BCDR) + IT/security + data-protection policies | Security & continuity awareness |
| IA-2026-001 / CSV-001 / CSV-002 (reference) | Optional, for relevant staff |

**Tier 3 — Skip (records/templates, not training):** FORM-TR-001 (it's the *record*), JD-001 job descriptions, restore-test / inspection-history records.

## 5. Assignment defaults
- Tier 1 modules → assigned to the relevant role group, **required**, due on hire + on SOP revision.
- Tier 2 policies → **all staff**, required, **annual** refresh.
- Completion + score + sign-off flow into the audit view (§2.3) → the ISO 17100 / IQVIA staff-competence evidence.

## 6. Sequencing
1. Build the 3 gap pieces (assignment + sign-off + audit view).
2. Pilot: convert TRN-RWS-001 + VAL-LV-001 (screenshots from Fayza's dry-run); assign VAL module to Fayza; she completes it → first signed-off record.
3. Confirm the audit view shows her completion; iterate.
4. Roll out Tier 1, then Tier 2, per the tables above.
