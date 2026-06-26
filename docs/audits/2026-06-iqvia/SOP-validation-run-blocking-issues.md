# SOP Validation Run — Morning Report & Blocking Issues

**Run:** 2026-06-26 (autonomous serial validation of all active SOPs)
**Outcome:** Every **active** SOP was validated against the live system and now has a Fayza verification guide delivered to **`D:\IQVIA AUDIT\Documents for Fayza\`**. Two system issues were found **and fixed + deployed**. Five SOPs are **blocked needing your input** (4 are drafts; 1 needs a management-review record). A short list of non-blocking content findings is at the end.

## What got done
- **18 Fayza guides** delivered (17 this run + SOP-012 from a prior session), each with real annotated portal screenshots, in `D:\IQVIA AUDIT\Documents for Fayza\`.
- **2 fixes shipped to production + merged:**
  - **SOP-001** — superseded SOP versions were mislabelled "active" across 10 SOPs (backfilled to "superseded") + added a delete-guard so recorded versions can't be deleted. (PR #1136)
  - **SOP-003** — the vendor-qualification page + server gate cited the retired SOP-001 procedure; repointed to SOP-003 and corrected all references. (PR #1144)
- Reusable config-driven guide engine committed (`e2e/capture-sop-guide.mjs`, `build-sop-guide.mjs`, `sop-configs/`), so future SOPs are one config + two commands.

## Status board

| SOP | Title | Status | Notes |
|---|---|---|---|
| SOP-001 | Document Control & Records Management | ✅ PASS | 2 fixes shipped; guide delivered |
| SOP-002 | Training and Competency Assessment | ⛔ Blocked | DRAFT — needs content + approval (B1) |
| SOP-003 | Vendor Qualification & Management | ✅ PASS | gate/UI ref fix shipped; guide delivered |
| SOP-004 | Project Management | ⛔ Blocked | DRAFT — needs content + approval (B1) |
| SOP-008 | Cognitive Debriefing | ✅ PASS | workflow = CD → QA Review → Final Deliverable, 0 translation steps |
| SOP-009 | Clinician Reviews | ✅ PASS | workflow = Clinician Review → QA Review → Final Deliverable, 0 translation steps |
| SOP-011 | Corrective and Preventive Actions | ✅ PASS | closed-loop quality system + real NC/CAPA records; append-only log |
| SOP-012 | Internal Audits | ✅ PASS (prior) | guide already published (CTH-VRF-012) |
| SOP-013 | Management Review | ⛔ Blocked | no management-review record exists (B2) |
| SOP-014 | Data Security and Confidentiality | ✅ PASS* | access-control confirmed; encryption/audit = IT (F3) |
| SOP-015 | Risk Management | ✅ PASS | §8 risk register accurate + cross-referenced |
| SOP-016 | Data Backup and Recovery | ✅ PASS | BKP-001 + RST-002/003 records on file |
| SOP-017 | Business Continuity and Disaster Recovery | ✅ PASS | SOP-017-A call-tree + RST-002 on file |
| SOP-018 | IT / Service Sub-processor Management | ✅ PASS | REG-SP-001 register on file |
| SOP-019 | COA Linguistic Validation Qualification | ✅ PASS* | COA qual lives in recruitment layer (F2) |
| SOP-020 | Vendor Inbox and AI Front-Desk | ✅ PASS | unified inbox + filter chips confirmed |
| SOP-021 | Answering AI Front-Desk Escalations | ✅ PASS | escalations land in the inbox for human reply |
| SOP-022 | Standard TEP | ✅ PASS | full TEP (T → edit/revise → proofread → release) |
| SOP-023 | Translation and Review | ✅ PASS | translation + independent review |
| SOP-024 | Certified Translation | ✅ PASS | §5.3.3 independent revision documented as NOT a step (honest) |
| SOP-025 | Transcription and Translation | ✅ PASS | transcription + translation; real order confirmed |
| SOP-026 | Software Development Lifecycle | ⛔ Blocked | DRAFT — needs content + approval (B1) |
| SOP-027 | Infrastructure and Application Change Control | ⛔ Blocked | DRAFT — needs content + approval (B1) |

\* PASS for the portal-confirmable controls; see the linked finding for the part that sits outside the portal.

---

## 🔴 BLOCKING — needs your input (these were skipped; the rest of the run continued)

### B1 — SOP-002, SOP-004, SOP-026, SOP-027 are DRAFTS (not active)
Four `v1 draft` placeholders (purpose + scope only, pointing to working `.docx` drafts in `docs/audits/2026-06-iqvia/`). Not effective procedures, so there is nothing live to validate and no "confirm the SOP matches the system" guide to build yet.
**You need to:** finalise/expand the content and **approve & activate** each. Also pending: reconcile SOP-002/004 with the RFQ versions IQVIA holds, and add SOP-022–027 to QM-002 (register drift). Once activated, I'll validate + build their guides.

### B2 — SOP-013 (Management Review) has no record in the system
SOP-013 is active, but there is **no management-review record** anywhere (Documents library or otherwise). A management review (ISO 9001 §9.3) is a periodic management activity producing minutes/actions — it can't be validated because the review hasn't been held/filed, and I can't perform it.
**You need to:** hold the management review and file the record (like internal-audit report IA-2026-001 sits in Documents → Quality Records). Then I'll validate + build the guide.

---

## 🟡 Non-blocking findings (for the QM — did not stop the run)

### F1 — Production/COA SOPs cite pre-renumbering SOP numbers (stale cross-references)
SOP-008 and SOP-009 (and likely SOP-022–025) cite **"SOP-006"** (COA qualification → now **SOP-019**), **"SOP-007"** (CAPA → now **SOP-011**), and **"SOP-PR-001"** (cognitive debriefing → now **SOP-008**) in their Governing-policy / Related-documents sections — old numbers from before the QM-002 consolidation. System behaviour is correct; this is a **content fix inside each SOP** that needs a new approved version (QM authority — I don't activate SOP versions autonomously). Recommend a batch re-version updating all cross-references.

### F2 — COA qualification (SOP-019) isn't surfaced on the vendor QMS tab
COA linguistic-validation qualification is managed in the **recruitment / COA-assessment layer** (COA quiz pass + documented domain evidence), and the COA assignment gate works — but a vendor's **QMS tab doesn't show their COA status**. Recommend surfacing COA qualification on the QMS tab so an auditor sees it in one place. (Enhancement, not a control failure.)

### F3 — SOP-014 encryption / audit-trail / network controls are IT-enforced (not portal-confirmable)
The access-control half of SOP-014 (individual named logins, roles, last-login) is confirmed in `/admin/staff`. Encryption-at-rest, system audit trails and network controls live at the infrastructure layer — **confirm these with IT (Cital)**; Fayza can't verify them from the portal.

---

_Reviewed in the morning: action B1 + B2 (your input), and decide on F1–F3._
