# SOP Validation Run — Blocking Issues Log

**Run started:** 2026-06-26 (autonomous serial validation of all active SOPs)
**Rule:** validate each SOP against the live system, fix non-blocking issues, build a Fayza verification guide, deliver to `D:\IQVIA AUDIT\Documents for Fayza\`, commit. If a SOP needs Raminder's input, **skip it and log it here**, then continue. Review this list in the morning.

## Status board

| SOP | Title | Status | Outcome |
|---|---|---|---|
| SOP-001 | Document Control & Records Management | ✅ Done | PASS; 2 fixes shipped; guide delivered |
| SOP-002 | Training and Competency Assessment | ⛔ Blocked | **DRAFT (not active)** — placeholder, needs content + approval |
| SOP-003 | Vendor Qualification & Management | ✅ Done | PASS; SOP-001→SOP-003 ref fix shipped; guide delivered |
| SOP-004 | Project Management | ⛔ Blocked | **DRAFT (not active)** — placeholder, needs content + approval |
| SOP-008 | Cognitive Debriefing | ✅ Done | PASS — workflow = Cognitive Debriefing → QA Review → Final Deliverable, 0 translation steps (confirmed on real orders); guide delivered |
| SOP-009 | Clinician Reviews | ✅ Done | PASS — workflow = Clinician Review → QA Review → Final Deliverable, 0 translation steps; guide delivered |
| SOP-011 | Corrective and Preventive Actions | — | |
| SOP-012 | Internal Audits | ✅ Done (prior) | Guide already published (CTH-VRF-012) |
| SOP-013 | Management Review | ⛔ Blocked | No management-review record exists; needs management to hold + file the first one (see B2) |
| SOP-014 | Data Security and Confidentiality | — | |
| SOP-015 | Risk Management | — | |
| SOP-016 | Data Backup and Recovery | — | |
| SOP-017 | Business Continuity and Disaster Recovery | — | |
| SOP-018 | IT / Service Sub-processor Management | — | |
| SOP-019 | COA Linguistic Validation Qualification | — | |
| SOP-020 | Vendor Inbox and AI Front-Desk | — | |
| SOP-021 | Answering AI Front-Desk Escalations | — | |
| SOP-022 | Standard TEP | — | |
| SOP-023 | Translation and Review | — | |
| SOP-024 | Certified Translation | — | |
| SOP-025 | Transcription and Translation | — | |
| SOP-026 | Software Development Lifecycle | ⛔ Blocked | **DRAFT (not active)** — placeholder, needs content + approval |
| SOP-027 | Infrastructure and Application Change Control | ⛔ Blocked | **DRAFT (not active)** — placeholder, needs content + approval |

## Blocking issues needing Raminder's input

### B1 — SOP-002, SOP-004, SOP-026, SOP-027 are DRAFTS (not active)
These four are `v1 draft` placeholders in the registry (purpose + scope only, pointing to working `.docx` drafts in `docs/audits/2026-06-iqvia/`). They are **not effective procedures**, so there is nothing live to validate and no Fayza "confirm the SOP matches the system" guide to build yet.
**Needs you to:** finalise/expand the content and **approve & activate** each (then I can validate + build guides). Decision also pending on reconciling SOP-002/004 with the RFQ versions IQVIA holds, and adding SOP-022–027 to QM-002 (register drift).

### B2 — SOP-013 (Management Review) has no record in the system
SOP-013 is active, but there is **no management-review record** anywhere in the portal (Documents library or elsewhere). A management review (ISO 9001 §9.3) is a periodic management activity that produces minutes/actions — it can't be validated against the system because the review itself hasn't been held/filed, and I can't perform it.
**Needs you to:** hold the management review and file the record (like the internal-audit report IA-2026-001 sits in Documents → Quality Records). Once a record exists, I can build the Fayza guide and validate it.

_(Further blockers appended below as the run proceeds.)_

## Non-blocking findings (QM content corrections — not blocking the guides)

### F1 — Production SOPs cite pre-renumbering SOP numbers (stale cross-references)
SOP-008 and SOP-009 (and likely 022–025) cite **"SOP-006"** (COA qualification → now **SOP-019**), **"SOP-007"** (CAPA → now **SOP-011**), and **"SOP-PR-001"** (cognitive debriefing → now **SOP-008**) in their "Governing policy" / "Related documents" sections. These are the old numbers from before the QM-002 consolidation. The *system* behaviour is correct; this is a **content fix inside the SOP text** that needs a new approved version of each affected SOP (QM authority — I don't activate SOP versions autonomously). Recommend a batch re-version that updates all cross-references to the current registry numbers.

