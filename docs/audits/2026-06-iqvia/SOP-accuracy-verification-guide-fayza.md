CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

# SOP Accuracy Verification Guide — "Does it match what we actually do?"

| | |
|---|---|
| **Reviewer** | Fayza El Bezzari |
| **Companion to** | SOP Verification Worksheet (Pass 1) — this guide covers Check #4 (Accuracy) in depth |
| **Date** | ____________________ |

## How this works
For each SOP below you'll find **what it claims** and the **exact steps to confirm it's true** in the portal. Some SOPs are technical or clinical — for those, the guide tells you **who to ask** instead of guessing.

- 🟢 **You can confirm this yourself** in the portal.
- 🔵 **Refer to someone** (IT / Raminder / clinical) — just tick "refer," don't try to judge it.
- **Never change anything.** If it doesn't match, describe the difference in the notes.

Log in to **portal.cethos.com** first.

---

## 🟢 SOP-001 — Document Control and Records Management
**What it claims:** SOPs and documents are version-controlled, can't be edited once approved, and are organized and downloadable.
**Confirm it:**
1. Open **/admin/sops** — you should see the list of SOPs, each with a **version number**.
2. Open any SOP — it shows its content and version.
3. Open **/admin/documents** — documents are grouped by category, each has a **Download** and a **version-history** (clock/history) button.
**Result:** ☐ Matches  ☐ Doesn't match  ☐ Refer to Raminder
**Notes:** ______________________________________________________________

## 🟢 SOP-003 — Vendor Qualification and Management
**What it claims:** linguists are qualified with a documented basis (a degree or years of experience) **plus evidence and a signed NDA**; only qualified linguists are approved.
**Confirm it:**
1. Open **/admin/vendors** and open a linguist we actually use.
2. Open their **QMS / Qualification tab** — confirm it shows a **qualification** with a **competence basis**, **evidence**, and an **NDA on file**.
3. Sanity check: a linguist with no evidence/NDA is **not** shown as approved.
**Result:** ☐ Matches  ☐ Doesn't match  ☐ Refer to Ashish (Lead Vendor Manager)
**Notes:** ______________________________________________________________

## 🔵 SOP-008 — Cognitive Debriefing  ·  🔵 SOP-009 — Clinician Reviews
**What they claim:** the steps for running cognitive-debriefing and clinician-review (clinical) projects.
**Confirm it:** these are **clinical-service processes** — read each and confirm with **Raminder / the clinical lead** that the described steps match how these projects actually run. *(Not something to judge from the portal.)*
**Result (SOP-008):** ☐ Confirmed  ☐ Refer to Raminder   **(SOP-009):** ☐ Confirmed  ☐ Refer to Raminder
**Notes:** ______________________________________________________________

## 🟢 SOP-011 — Corrective and Preventive Actions
**What it claims:** quality issues are logged as nonconformities → CAPAs with an owner and due date → closed.
**Confirm it:**
1. Open **/admin/quality** — you should see nonconformity and CAPA records (look for **NC-2026-00004/00005/00006** and **CAPA-2026-00004/00005/00006**).
2. Open one — confirm it shows the **finding, the action, an owner, and a due date**.
**Result:** ☐ Matches  ☐ Doesn't match  ☐ Refer to Raminder
**Notes:** ______________________________________________________________

## 🟢 SOP-012 — Internal Audits
**What it claims:** internal audits are scheduled and reported; the first one is done.
**Confirm it:** Open **/admin/documents → Quality Records** — confirm **"IA-2026-001 Internal Audit Report"** is there and opens.
**Result:** ☐ Matches  ☐ Doesn't match  ☐ Refer to Raminder
**Notes:** ______________________________________________________________

## 🔵 SOP-013 — Management Review
**What it claims:** senior management formally reviews the QMS each quarter.
**Confirm it:** **Refer to Raminder** — confirm these reviews happen (or are scheduled) as described. *(A management process, not a portal record.)*
**Result:** ☐ Refer to Raminder
**Notes:** ______________________________________________________________

## 🟡 SOP-014 — Data Security and Confidentiality
**What it claims:** individual logins (no shared accounts), encryption, an unchangeable audit trail, and signed NDAs.
**Confirm it:**
- 🟢 **You can confirm:** you log in with **your own** account and role (not a shared login); NDAs appear on linguist records (SOP-003 step 2).
- 🔵 **Refer to IT (Cital) / Raminder:** encryption, the unchangeable audit trail, and access restrictions (these are behind-the-scenes).
**Result:** ☐ Logins/NDA confirmed  ☐ Backend referred to IT
**Notes:** ______________________________________________________________

## 🟡 SOP-015 — Risk Management
**What it claims:** Cethos tracks risks; §8 lists the current key risks (e.g., data hosted in the US, single qualification approver, reliance on the platform provider).
**Confirm it:** **read the "current key risks" list (§8)** and confirm they're real and sensible — flag any that are **wrong or missing**. The formal register → refer to Raminder.
**Result:** ☐ Risk list accurate  ☐ Something wrong/missing (note below)  ☐ Refer to Raminder
**Notes:** ______________________________________________________________

## 🟡 SOP-016 — Data Backup and Recovery
**What it claims:** automatic backups + point-in-time recovery + an independent off-site copy, proven by a restore test.
**Confirm it:**
- 🟢 **You can confirm the evidence exists:** **/admin/documents** → confirm **CTS-REC-BKP-001 (Backup Verification)** and **CTS-REC-RST-002 (Restore Test)** are there and open.
- 🔵 **Refer to IT (Cital):** the actual backup configuration.
**Result:** ☐ Evidence records exist  ☐ Config referred to IT
**Notes:** ______________________________________________________________

## 🟡 SOP-017 — Business Continuity and Disaster Recovery
**What it claims:** a continuity/disaster plan with scenarios and a call-tree; recovery is tested.
**Confirm it:**
- 🟢 **You can confirm:** **/admin/documents** → **"SOP-017-A BCDR Call-Tree"** and **CTS-REC-RST-002 (Restore Test)** exist.
- 🔵 **Refer to Raminder:** that the plan's scenarios reflect reality.
**Result:** ☐ Annex + test exist  ☐ Plan referred to Raminder
**Notes:** ______________________________________________________________

## 🟢 SOP-018 — IT / Service Sub-processor Management
**What it claims:** outside tools are tracked; **clinical content lives only in 4 controlled stores (Supabase, AWS, SharePoint, Dropbox)** and never goes to AI or email.
**Confirm it:** **/admin/documents** → open **REG-SP-001 (Sub-processor Register)** → confirm the listed tools match what we actually use, and that — from your experience — **clinical files are never emailed or run through AI/OCR**. Flag any tool we use that's missing.
**Result:** ☐ Register matches reality  ☐ Something missing/wrong  ☐ Refer to IT
**Notes:** ______________________________________________________________

## 🟢 SOP-019 — COA Linguistic Validation Qualification
**What it claims:** a specific qualification path for COA (clinical-outcome-assessment) linguists.
**Confirm it:** **/admin/vendors** → confirm COA-qualified linguists have a **COA qualification** recorded. If unsure, **refer to Ashish (Lead Vendor Manager)**.
**Result:** ☐ COA quals exist  ☐ Refer to Ashish
**Notes:** ______________________________________________________________

## 🟡 SOP-020 — Vendor Inbox and AI Front-Desk (Mail Infrastructure)
**What it claims:** there's a vendor email inbox with an AI front-desk that handles incoming mail.
**Confirm it:** open the **Vendor Communication / inbox** area in the portal (under Vendors) and confirm the inbox exists and shows incoming mail as described. Technical mail setup → refer to IT.
**Result:** ☐ Inbox exists/works  ☐ Refer to IT
**Notes:** ______________________________________________________________

## 🔵 SOP-021 — Answering AI Front-Desk Escalations
**What it claims:** how staff answer the escalations the front-desk passes to a human.
**Confirm it:** confirm with **whoever handles front-desk replies (or Raminder)** that the described steps match how we actually answer.
**Result:** ☐ Confirmed by ops  ☐ Refer to Raminder
**Notes:** ______________________________________________________________

---

## When you've finished
Send this guide back to Raminder with your results. For anything you marked **"Doesn't match"** or **"refer,"** add a short note — that's the most useful part.

*** END OF GUIDE ***
