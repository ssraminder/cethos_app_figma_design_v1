# SOP-022 — Standard TEP (Translation · Editing · Proofreading)

| | |
|---|---|
| **Document ID** | SOP-022 |
| **Title** | Running a Standard TEP order — translation, editing and proofreading by three independent linguists |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM or coordinator running a Standard TEP order in the admin portal (`portal.cethos.com`) |
| **Status** | Active · v1.0 (2026-06-25) |
| **Category** | Production |
| **Governing policy** | SOP-003 (Vendor Qualification and Management), SOP-001 (Document Control and Records Management), SOP-011 (Corrective and Preventive Actions) |
| **Standard** | ISO 17100:2015 — Clause 4 (pre-production); §5.2 (project management & client communication); §5.3.1 (translation), §5.3.2 (translator self-check), **§5.3.3 (revision by a second linguist)**, **§5.3.5 (proofreading)**, §5.3.6 (final verification & release); Clause 6 (§6.1 feedback, §6.2 records). |

---

## 1. Purpose & principle

This runbook says **how** to run a **Standard TEP** order in the portal, end to end, and **what records** it must leave for an ISO 17100 / IQVIA auditor. Standard TEP delivers the **full ISO 17100 production chain** — **T**ranslation → **E**diting (revision) → **P**roofreading — performed by **three independent linguists**. It is Cethos's **strongest conformance posture** for general translation and the default for quality-critical, non-certified content.

**The one principle that governs everything:** *the target text is produced by a qualified translator, independently revised by a second qualified linguist comparing source and target (§5.3.3), independently proofread by a third (§5.3.5), then verified and released — and the independence of each linguist from the previous one is the audit-critical control.* The portal **enforces** that independence (a translator cannot edit their own work; a proofreader cannot be the translator or the editor); never override it.

---

## 2. Scope & definitions

- **Standard TEP:** a non-certified translation delivered through Translation → Editing → Proofreading, with a customer draft review and an internal QA verification before release.
- **Translation (§5.3.1) + self-check (§5.3.2):** the translator renders the source into the target language and checks their own work before handoff.
- **Editing / revision (§5.3.3):** a **second** qualified linguist compares source against target for accuracy, completeness, terminology, register and consistency, and corrects. This is the ISO 17100 mandatory revision step.
- **Proofreading (§5.3.5):** a **third** qualified linguist examines the revised target (typically monolingual) for residual errors, layout and fitness for purpose before release.
- **Customer draft review:** a client value-add touchpoint where the customer sees the draft and may comment. It is **not** an ISO production step and does **not** substitute for §5.3.3 revision (the customer is not a qualified reviser).
- **QA review:** Cethos's internal final verification (§5.3.6) that the agreed specifications were met before release.
- **Out of scope:** certified/sworn translation (use the `certified_translation` workflow), MT post-editing (MTPE), and single-reviser translation (use **SOP-023 Translation and Review**). If a project needs certification, raise it on the certified workflow — do not bolt a certificate onto TEP.

---

## 3. The process & ISO phase mapping

| ISO phase | What happens here | System record |
|---|---|---|
| **Pre-production** (Clause 4) | Enquiry → quote/order; agree languages, scope, intended use, delivery date, special instructions (§4.4 client agreement). Assign qualified translator, editor and proofreader (§4.6). | Quote/order record; client PM; `assignment_eligibility_events` |
| **Production** (Clause 5) | **Translation** (§5.3.1) + self-check (§5.3.2) → **Editing** (§5.3.3 revision) → **Proofreading** (§5.3.5) → **Customer draft review** → **internal QA review** (§5.3.6 verification). PM maintains client communication and handles queries (§5.2). | `order_workflow_steps` (Translation → Editing → Proofreading → Customer Draft Review → QA Review) |
| **Post-production** (Clause 6) | Release & deliver → confirm receipt → solicit feedback (§6.1); archive (§6.2, ≥5 yrs). | Final Deliverable; delivery confirmation; feedback / CAPA record |

**Operational workflow (portal):** `standard_tep` template — **Translation → Editing → Proofreading → Customer Draft Review → QA Review → Final Deliverable.**

**Independence the system enforces (do not override):**
- **Editing** must be a **different vendor from the Translator** (`requires_different_vendor_from_step = [1]`).
- **Proofreading** must be a **different vendor from both the Translator and the Editor** (`requires_different_vendor_from_step = [1,2]`).
- The **Customer Draft Review gates approval** of the production work (`approval_depends_on_step`): the order does not finalize until the customer has had the draft and any review is resolved, after which internal QA verifies and releases.

---

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| **Project Manager (Cethos)** | Owns the order. Confirms scope/specs with the client, assigns the three independent linguists, monitors progress, runs client communication, manages the customer draft review, releases the deliverable, captures feedback. |
| **Translator** (§5.3.1) | Qualified per SOP-003 for the language pair & subject matter. Produces the target text and performs the §5.3.2 self-check before handoff. |
| **Editor / reviser** (§5.3.3) | A **second** qualified linguist, independent of the translator. Bilingual source↔target revision; corrects accuracy, completeness, terminology, register, consistency. |
| **Proofreader** (§5.3.5) | A **third** qualified linguist, independent of translator and editor. Final monolingual check of the revised target for residual errors and fitness for purpose. |
| **Internal QA reviewer (Cethos)** | Confirms the agreed specifications were met, all steps completed by independent linguists, and the file is client-ready. Records sign-off before release (§5.3.6). |
| **Client** | Provides source, reference/terminology and instructions; agrees specs; reviews the draft; may provide feedback. |

---

## 5. Operational procedure (the core loop)

1. **Receive & check the order.** Confirm source files, language pair(s), subject matter, intended use, reference material / glossaries, delivery date and special instructions. If anything is missing or ambiguous, **request it before assigning** (§7). The quote/order record **is** your pre-production specification (§4.4) — there is no separate "project preparation" step.
2. **Assign the Translator.** Use **Find Vendor** → assign a linguist qualified (SOP-003) for the pair and subject matter to **step 1 Translation**. The eligibility decision is logged (`assignment_eligibility_events`).
3. **Translation + self-check (vendor).** The translator delivers the target file and confirms the §5.3.2 self-check. Upload to the step.
4. **Assign the Editor and Proofreading separately.** Assign **step 2 Editing** to a *different* qualified linguist; assign **step 3 Proofreading** to a *third* linguist different from both. The portal will block a same-vendor assignment — this is the §5.3.3/§5.3.5 independence control, not an error to work around.
5. **Editing / revision (§5.3.3).** The editor compares source↔target and corrects; documents material changes. Upload the revised file.
6. **Proofreading (§5.3.5).** The proofreader checks the revised target for residual issues, layout and fitness for purpose. Upload the proofread file.
7. **Customer draft review.** Share the draft with the customer (step 4). Record any client comments on the order; incorporate agreed changes (route substantive linguistic changes back to the relevant linguist, not ad-hoc). Customer sign-off gates approval of the production work.
8. **Internal QA review (§5.3.6).** A Cethos reviewer verifies the agreed specs were met, all three steps were completed by independent linguists, and the file is client-ready. Record sign-off (who/when). If it fails, return to the responsible step with documented reasons.
9. **Release & deliver.** Assemble the final deliverable and **Send to client** (final verification & release, §5.3.6).
10. **Confirm receipt** (delivery confirmation) and **solicit feedback** (§6.1). Route any complaint into CAPA per SOP-011.

---

## 6. Quality controls

- **Three independent linguists (the core control).** Translator ≠ Editor ≠ Proofreader, enforced by `requires_different_vendor_from_step`. This is the §5.3.3 (revision) + §5.3.5 (proofreading) conformance basis; it is the first thing an auditor checks. Never assign the same vendor to two of these steps, and never disable the gate.
- **Competence (SOP-003).** Every linguist must be qualified for the language pair and subject matter; assignment eligibility is gated and logged.
- **Translator self-check (§5.3.2).** Required before handoff to editing — not optional.
- **Customer draft review.** A client value-add layered on top of production; it does not replace §5.3.3 revision and the customer is not recorded as a reviser.
- **Internal QA verification (§5.3.6).** Independent Cethos confirmation that specs were met and all steps completed by independent linguists; sign-off recorded before release.
- **Confidentiality & data protection.** Source and target handled under each linguist's NDA and the data-protection policy.

---

## 7. Client communication (all recorded against the order)

- **Intake / agreement (§4.4):** confirm languages, scope, intended use, reference/terminology, delivery date and format **before assigning**. This agreement is the pre-production record.
- **Queries during the project (§5.2):** any clarification (ambiguous source, terminology, layout) goes PM ↔ client and is recorded on the order. A query that blocks production pauses it until resolved.
- **Customer draft review:** share the draft, capture comments, resolve them through the responsible linguist; the review gates final approval.
- **Delivery (§5.3.6):** the deliverable is sent and **receipt confirmed**.
- **Feedback (§6.1):** solicit client feedback after delivery; log it. Complaints → CAPA (SOP-011).

> These touchpoints are captured on the order's communication trail. The portal enhancement to log them immutably (client-communication / lifecycle audit log) is planned; until it ships, record them on the order communications and the final-deliverable send log.

---

## 8. Records & retention (ISO §6.2 — ≥5 years)

Every Standard TEP order must leave this evidence trail:

- **Order / quote record** — languages, scope, intended use, delivery date, client PM, agreed specs (the §4.4 agreement).
- **Three assignment + eligibility logs** (`assignment_eligibility_events`) — translator, editor, proofreader: who, qualified how, when, and that each is independent.
- **Step files** — translated, edited and proofread versions at each step.
- **Customer draft review** — what was shared, client comments, how resolved.
- **Internal QA sign-off** — reviewer identity + timestamp + outcome.
- **Delivery confirmation** — what was sent, to whom, when.
- **Client feedback / CAPA** — feedback captured; any complaint linked to its CAPA record.

Retain ≥5 years per ISO 17100 §6.2 and the data-protection policy. Per-cycle audit reports live in `docs/audits/`.

---

## 9. Don't

- **Don't assign the same vendor to two of Translation / Editing / Proofreading.** The independence of the reviser and proofreader is the ISO 17100 control; the portal blocks it and so must you.
- **Don't treat the customer draft review as the §5.3.3 revision.** The customer is not a qualified reviser; revision is the independent Editing step.
- **Don't skip the translator self-check (§5.3.2)** or the internal QA sign-off (§5.3.6).
- **Don't release before customer sign-off and QA verification.**
- **Don't use an unqualified linguist** — each must be qualified per SOP-003 for the pair and subject matter.
- **Don't add certification to a TEP order** — use the `certified_translation` workflow instead.

---

## 10. Related documents

- **SOP-026** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-023** — Translation and Review (single-reviser variant, no proofreading step).
- **SOP-003** — Vendor Qualification and Management (who may translate / revise / proofread).
- **SOP-001** — Document Control and Records Management (records & retention).
- **SOP-011** — Corrective and Preventive Actions (feedback / complaint route).
- **Workflow mapping** — `docs/audits/2026-06-iqvia/Cethos-Workflow-ISO17100-Mapping.pptx` (where Standard TEP sits among the workflows).
- **Standard** — ISO 17100:2015 (§5.3 translation production).
