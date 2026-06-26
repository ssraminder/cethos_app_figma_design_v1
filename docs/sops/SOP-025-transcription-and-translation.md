# SOP-025 — Transcription and Translation

| | |
|---|---|
| **Document ID** | SOP-025 |
| **Title** | Running a Transcription and Translation order — transcribe audio/video, then translate with independent review |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM or coordinator running a transcription + translation order in the admin portal (`portal.cethos.com`) |
| **Status** | Active · v1.0 (2026-06-25) |
| **Category** | Production |
| **Governing policy** | SOP-003 (Vendor Qualification and Management), SOP-001 (Document Control and Records Management), SOP-011 (Corrective and Preventive Actions) |
| **Standard** | ISO 17100:2015 — Clause 4 (pre-production); §5.2 (project management & client communication); §5.3.1 (translation), §5.3.2 (translator self-check), **§5.3.3 (revision by a second linguist)**, §5.3.6 (final verification & release); Clause 6 (§6.1 feedback, §6.2 records). Transcription is a pre-translation production activity. |

---

## 1. Purpose & principle

This runbook says **how** to run a **Transcription and Translation** order in the portal, end to end, and **what records** it must leave for an ISO 17100 / IQVIA auditor. The workflow **transcribes source audio/video into text**, then **translates** that transcript with an **independent second-linguist review (§5.3.3)** and internal QA before release.

**The one principle that governs everything:** *the translation is only as good as the transcript it is built on — so the transcript must be accurate before translation begins, and the translation must be independently revised (§5.3.3) before release.* The portal **enforces** that the reviser is not the translator; never override it.

---

## 2. Scope & definitions

- **Transcription:** converting source-language audio/video into accurate written text (verbatim or clean-read, per the client's instruction), with speaker labels / timestamps where requested.
- **Translation (§5.3.1) + self-check (§5.3.2):** a qualified translator renders the transcript into the target language and checks their own work before handoff.
- **Review / revision (§5.3.3):** a **second** qualified linguist, **independent of the translator**, compares the translation against the transcript and corrects accuracy, completeness, terminology, register and consistency. This is the ISO 17100 mandatory revision step.
- **QA review:** Cethos's internal final verification (§5.3.6) that the agreed specifications were met before release.
- **Out of scope:** subtitling / timing / on-screen text (separate workflow), and standalone transcription with no translation. This workflow has **no customer draft review step**.

---

## 3. The process & ISO phase mapping

| ISO phase | What happens here | System record |
|---|---|---|
| **Pre-production** (Clause 4) | Enquiry → quote/order; agree source media, source & target languages, verbatim vs clean-read, timestamps/speaker labels, delivery date (§4.4 client agreement). Assign a qualified transcriber, translator and reviser (§4.6). | Quote/order record; client PM; `assignment_eligibility_events` |
| **Production** (Clause 5) | **Transcription** (audio/video → text) → **Translation** (§5.3.1) + self-check (§5.3.2) → **Review** (§5.3.3 revision) → **internal QA review** (§5.3.6 verification). PM maintains client communication and handles queries (§5.2). | `order_workflow_steps` (Transcription → Translation → Review → QA Review) |
| **Post-production** (Clause 6) | Release & deliver → confirm receipt → solicit feedback (§6.1); archive (§6.2, ≥5 yrs). | Final Deliverable; delivery confirmation; feedback / CAPA record |

**Operational workflow (portal):** `transcription_translation` template — **Transcription → Translation → Review → QA Review → Final Deliverable.**

**Independence the system enforces (do not override):**
- **Review** must be a **different vendor from the Translator** (`requires_different_vendor_from_step = [2]`). This is the §5.3.3 control.

---

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| **Project Manager (Cethos)** | Owns the order. Confirms specs with the client, assigns the transcriber, translator and independent reviser, monitors progress, runs client communication, releases the deliverable, captures feedback. |
| **Transcriber** | Qualified for the source language and transcription. Produces an accurate transcript to the agreed convention (verbatim/clean-read, timestamps, speaker labels). |
| **Translator** (§5.3.1) | Qualified per SOP-003 for the language pair & subject matter. Translates the transcript and performs the §5.3.2 self-check before handoff. |
| **Reviser** (Review step, §5.3.3) | A **second** qualified linguist, independent of the translator. Compares translation against the transcript and corrects. |
| **Internal QA reviewer (Cethos)** | Confirms the agreed specifications were met, the translation steps were completed by independent linguists, and the file is client-ready. Records sign-off before release (§5.3.6). |
| **Client** | Provides the source media and instructions; may provide feedback. |

---

## 5. Operational procedure (the core loop)

1. **Receive & check the order.** Confirm source media files, source & target languages, **verbatim vs clean-read**, timestamps / speaker labels, audio quality / number of speakers, subject matter and delivery date. If anything is missing or ambiguous, **request it before assigning** (§7). The quote/order record **is** your pre-production specification (§4.4).
2. **Assign the Transcriber.** Use **Find Vendor** → assign someone qualified for the source language & transcription to **step 1 Transcription**. The eligibility decision is logged (`assignment_eligibility_events`).
3. **Transcription.** The transcriber produces the transcript to the agreed convention and checks it against the audio. Upload to the step. Resolve inaudible/unclear passages (flag and query the client where needed) **before** translation — do not translate from an unverified transcript.
4. **Assign the Translator and the Reviser separately.** Assign **step 2 Translation** to a qualified linguist; assign **step 3 Review** to a *different* qualified linguist. The portal will block a same-vendor assignment on Review — this is the §5.3.3 independence control, not an error to work around.
5. **Translation + self-check (§5.3.2).** The translator renders the transcript into the target language and confirms the self-check. Upload the target file.
6. **Review / revision (§5.3.3).** The reviser compares translation against the transcript and corrects; documents material changes. Upload the revised file.
7. **Internal QA review (§5.3.6).** A Cethos reviewer verifies the agreed specs were met, the translation + review were completed by independent linguists, and the file is client-ready. Record sign-off (who/when). If it fails, return to the responsible step with documented reasons.
8. **Release & deliver.** Assemble the final deliverable and **Send to client** (final verification & release, §5.3.6).
9. **Confirm receipt** (delivery confirmation) and **solicit feedback** (§6.1). Route any complaint into CAPA per SOP-011.

---

## 6. Quality controls

- **Accurate transcript first.** Transcription is checked against the audio and unclear passages resolved before translation — the translation rests on it.
- **Independent review (the core §5.3.3 control).** Reviser ≠ Translator, enforced by `requires_different_vendor_from_step`. This is the §5.3.3 conformance basis and the first thing an auditor checks. Never assign the same vendor to Translation and Review, and never disable the gate.
- **Competence (SOP-003).** Transcriber, translator and reviser must each be qualified for their task and language; assignment eligibility is gated and logged.
- **Translator self-check (§5.3.2).** Required before handoff to review — not optional.
- **Internal QA verification (§5.3.6).** Independent Cethos confirmation that specs were met and the translation/review were completed by independent linguists; sign-off recorded before release.
- **Confidentiality & data protection.** Source media (often sensitive recordings) handled under each vendor's NDA and the data-protection policy.

---

## 7. Client communication (all recorded against the order)

- **Intake / agreement (§4.4):** confirm source & target languages, verbatim vs clean-read, timestamps / speaker labels, audio quality and delivery format **before assigning**. This agreement is the pre-production record.
- **Queries during the project (§5.2):** inaudible passages, unclear speakers or terminology go PM ↔ client and are recorded on the order. A query that blocks production pauses it until resolved.
- **Delivery (§5.3.6):** the deliverable is sent and **receipt confirmed**. (There is no customer draft-review step in this workflow.)
- **Feedback (§6.1):** solicit client feedback after delivery; log it. Complaints → CAPA (SOP-011).

> These touchpoints are captured on the order's communication trail. The portal enhancement to log them immutably (client-communication / lifecycle audit log) is planned; until it ships, record them on the order communications and the final-deliverable send log.

---

## 8. Records & retention (ISO §6.2 — ≥5 years)

Every transcription + translation order must leave this evidence trail:

- **Order / quote record** — source media, languages, transcription convention, delivery date, client PM, agreed specs (the §4.4 agreement).
- **Three assignment + eligibility logs** (`assignment_eligibility_events`) — transcriber, translator, reviser: who, qualified how, when, and that the reviser is independent of the translator.
- **Transcript file** — the verified source-language text.
- **Step files** — translated and revised target versions.
- **Internal QA sign-off** — reviewer identity + timestamp + outcome.
- **Delivery confirmation** — what was sent, to whom, when.
- **Client feedback / CAPA** — feedback captured; any complaint linked to its CAPA record.

Retain ≥5 years per ISO 17100 §6.2 and the data-protection policy. Per-cycle audit reports live in `docs/audits/`.

---

## 9. Don't

- **Don't translate from an unverified transcript** — resolve inaudible/unclear passages first.
- **Don't assign the same vendor to Translation and Review.** The reviser's independence is the ISO 17100 §5.3.3 control; the portal blocks it and so must you.
- **Don't skip the translator self-check (§5.3.2)** or the internal QA sign-off (§5.3.6).
- **Don't release before QA verification.**
- **Don't use an unqualified vendor** — transcriber, translator and reviser must each be qualified for their task and language (SOP-003).

---

## 10. Related documents

- **SOP-028** — Post-Delivery Client Review & Revision Rounds (client review/changes after delivery → controlled revision round on the revised version, billing, and the already-invoiced → new-order rule).
- **SOP-023** — Translation and Review (the translation+review pattern this workflow embeds).
- **SOP-003** — Vendor Qualification and Management (who may transcribe / translate / revise).
- **SOP-001** — Document Control and Records Management (records & retention).
- **SOP-011** — Corrective and Preventive Actions (feedback / complaint route).
- **Workflow mapping** — `docs/audits/2026-06-iqvia/Cethos-Workflow-ISO17100-Mapping.pptx` (where transcription + translation sits among the workflows).
- **Standard** — ISO 17100:2015 (§5.3 translation production).
