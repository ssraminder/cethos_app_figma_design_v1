# Employee Training Module — Recruitment & Linguist Qualification

**Audience:** Vendor Management / Project Management staff (and the acting Vendor Manager).
**Purpose:** how the recruitment-to-qualification pipeline works, what is automated vs. what needs a human, and your responsibilities under ISO 17100 + the IQVIA/COA requirements.
**Governing SOPs:** SOP-001 / VM-001 (qualification), SOP-002 (maintenance).

> *Screenshots are captured from the live portal and inserted in the Word version — placeholders marked `[screenshot]` below.*

---

## 1. The pipeline in one picture

```
Application submitted (join.cethos.com)
   → AUTO pre-screen (AI reads the CV)                 [no human]
        ├─ strong + documented → invite test/quiz       [no human]
        ├─ missing documentation → AUTO document request [no human]  ← NEW
        └─ genuine concern → Needs Attention queue       [human]
   → Test / quiz (incl. COA quiz for COA track)
   → Evidence + test complete → ready for decision       [human]
   → APPROVE + activation email                          [HUMAN ONLY]
```

**Golden rule:** the system does everything up to the decision. **Only a human approves a vendor and sends the activation email.** Never automate that step.

## 2. What is automated (don't redo it by hand)
- **Pre-screening** — every application is AI-CV-reviewed automatically. `[screenshot: AI Score column]`
- **Document requests** — if the CV review finds missing documentation (CV, credential evidence, work samples), the system now **emails the applicant automatically** and sets status **Info Requested**. You no longer chase these by hand. `[screenshot: status = Info Requested]`
- **Test/quiz invitations**, **reminders**, **queued rejections** — all on automated schedules.

## 3. Your queues (the human work)
Open **/admin/recruitment**. Tabs: `[screenshot: tabs]`
- **Needs Attention** — applications the system couldn't decide (contradictions, AI flags, references received). Review the AI assessment, then advance / request info / decline.
- **Tests to Review** — submitted tests needing your eyes (borderline AI scores, AI auto-approvals to confirm).
- **In Progress** — waiting on the applicant or system; no action unless stalled.
- **Decided / Waitlist** — history.

## 4. Recording a qualification (ISO 17100 §3.1.4)
A linguist may only work once their qualification is **recorded with documented evidence**:
1. Open the vendor → **QMS tab**. `[screenshot: QMS tab]`
2. Confirm the §3.1.4 basis: (a) translation degree, (b) other degree + 2 years, or (c) 5 years' documented experience. For long-term vendors, **our own payment/PO history is valid documented evidence** of experience (VM-001 v1.1 §5.5).
3. For COA work, also record the **life-sciences subject-matter** qualification (their clinical project history is the evidence).
4. Confirm the **NDA** is on file.
5. Click **Mark vendor qualified**. `[screenshot: Mark qualified]`

## 5. COA track (clinical outcome assessments)
- COA linguists additionally need: **COA methodology training** completion, a **COA test/quiz** pass, and the **life-sciences subject-matter** qualification.
- The **COA quiz** has two parts: Part 1 = COA knowledge MCQs; Part 2 = translate short English sentences into the native language (AI-graded by MQM). `[screenshot: COA quiz]`
- COA work is **conceptual** translation — the test rewards preserving meaning, not literal wording.

## 6. Confidentiality (clinical materials)
- NDA before any project materials are shared. Secure transfer only — never unencrypted email of confidential content. Delete copies on project completion. Report any suspected breach to the Vendor Manager immediately.

## 7. Escalation
Borderline qualification calls, agency vendors, or anything unclear → escalate to the **Managing Director** (final approver per VM-001 § Responsibilities).

## 8. What an auditor will check (so do it right every time)
- Every working linguist has a **recorded §3.1.4 basis with evidence on file**.
- **Reviser ≠ translator** on the same file (enforced by the system — never override without written justification).
- Decisions are **logged** (who/what/when). Don't make off-system decisions.
