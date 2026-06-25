CETHOS TRANSLATION SERVICES — 12537494 Canada Inc.

# Session Handover — IQVIA Audit Prep: SOP Verification Phase
**Written:** 2026-06-25 · **For:** the next Claude Code session (and Raminder)

> Read this top-to-bottom before doing anything. It is the authoritative pickup point. The harness auto-memory file `feature_qms_sharepoint_authoritative_bcdr_gap_2026_06_24.md` carries the same state in condensed form.

---

## 1. The big picture
**Goal:** prepare Cethos for the **IQVIA remote vendor-qualification audit, 29–30 June 2026**. Scope = **COA Linguistic Validation translation services**. Auditor: Zachary Haese (IQVIA EQA-Vendor). RFP stage. IQVIA "Supplier Management" = Cethos "HR + Vendor Onboarding". Covers QMS/SOPs/CAPA/training/supplier-mgmt/CSV-21CFR11/BCDR/doc-retention. CAPA response due ~14 days after the audit form is issued.

**Where we are now:** the QMS **document set is built and in the portal** (see §6). We are in the **verification phase** — confirming each SOP is *accurate to how the system actually works* before the audit, because the portal is new and may have bugs. **Fayza El Bezzari** (Account Manager) is the human verifier.

**Cethos is NOT ISO 17100 certified** — working toward it (Stage 2 target Dec 2026). Never claim certification in outward materials.

---

## 2. The verification approach (user-chosen — follow it exactly)
For each SOP, run this loop:
1. **Walk the real flow live via Chrome MCP** on the admin portal — discover the actual screens/steps and surface any bugs.
2. **Write a screen-accurate verified guide** for Fayza (one Google Doc per SOP) from what actually works.
3. **Fayza re-walks it** with clearly-marked `ZZ-TEST` dummy data (archived after) and **signs off**.
4. Fix any real issues found.

**Hard safety rules:**
- **Irreversible flows → inspect real records, never dummy-create.** Qualification onboarding writes a permanent, append-only record (`qms.qualification_audit_log`, trigger `audit_log_no_mutate`). The CAPA/quality log is also append-only (hash-chained). For SOP-003/011/019 the guides are **LOOK-ONLY** (no dummy data; inspect existing records).
- **Never feed clinical data to AI.** Clinical/COA content lives only in Supabase, Dropbox, SharePoint, AWS S3. Brevo = email delivery only (never carries attachments).
- **Mark any test data `ZZ-TEST`** and remove/archive it.

---

## 3. Environment & tools (all confirmed working this session)
- **Admin portal:** `admin.cethos.com` → redirects to `portal.cethos.com/admin/dashboard`. Routes are `/admin/*`.
- **Chrome MCP** (`mcp__Claude_in_Chrome__*`): **Browser 1** (the user's machine) is connected and **already logged in** (OTP — only the user can log in, so keep that browser authenticated). Drive it with `navigate`, `read_page` (note: it can **truncate the left-nav list** — scroll to see all sections), `computer` (screenshot/click/scroll/type; click via `ref` from `read_page` to avoid coordinate-scaling issues — screenshots are 1568×772 but the viewport is 1920×945).
- **Google Drive MCP** (`mcp__3f920822-...`): account **ss.raminder@gmail.com**. `create_file` with `contentMimeType:"text/html"` **converts HTML → an editable Google Doc** (works great). ⚠️ There is **no update-content or delete tool** — you cannot edit or delete an existing Doc via the MCP, only create new ones. The 4 guides so far are in **My Drive (root)**; consider making an "IQVIA Audit – SOP Verification" folder for the rest (folders: `create_file` with `contentMimeType:"application/vnd.google-apps.folder"`).
- **Supabase MCP** (`mcp__e57307c9-...`): project **lmzoyezvsjgsxveoakdr** (org zpesxrmvyzivuxkorwce). `execute_sql` for inspection.

---

## 4. DONE this session — 4 verified guides in Google Drive
| SOP | Title | Result | Drive Doc |
|---|---|---|---|
| **SOP-001** | Document Control & Records Mgmt | ✅ Verified — `/admin/sops` (15 SOPs, categorized, versioned + "active") and `/admin/documents` (versioned, Published, version history) both work | docId `1Sy6hJ_Y-FS0C-FUjpUy_yh-fWas-Tt_ifhwx6wNjA6E` |
| **SOP-011** | Corrective & Preventive Action (CAPA) | ✅ Verified — `/admin/quality` hub + NC detail (`/admin/quality/nc/{id}`): description, 5-whys root cause, CAPA action w/ owner+due+status, append-only audit trail | docId `1LeMRjzwxc5j28UpnJftcoKw5mAiCVbpIW5N_-wTrN8I` |
| **SOP-003** | Vendor Qualification & Mgmt | ✅ Verified — vendor **QMS tab** (`?tab=qms`). Worked example **Omotola** (vendor `994fb211-a35b-44ff-a37c-0368a16b0ce5`): NDA on file + qualified role w/ competence basis + 6 verified evidence items (sha-256) + language pairs | docId `1ahfIq-FFJkiCMkuyhiNLDwsLHtszeaLk_M3xF1s2-qQ` |
| **SOP-019** | COA Linguistic Validation Qualification | ⚠️ Reviewed w/ FINDING — COA qual lives in the **recruitment layer** (`cvp_translator_domains` → `cvp_translators`), per-pair, audited, revocable; **NOT on the vendor QMS tab** | docId `1A0Wf_IjrzWmHW4qGSeOQpRXMrMyp6Bx4UU1DlRIYrnI` |

---

## 5. Portal patterns confirmed (so you don't re-discover them)
- **SOP registry** `/admin/sops`: SOPs grouped by category (Human Resources, IT/Systems, Operations, Production, Quality Assurance), each with version + "active" badge + ISO ref + effective date + Word/PDF export. "New SOP" + per-row "Export SOP".
- **Documents library** `/admin/documents`: grouped (QMS Core, Quality Records, Policies, Supplier Management), each with version, audience tag (Staff), Published toggle, version-history expander (›), download/edit/archive. "Add document".
- **Quality hub** `/admin/quality`: 4 KPI cards (Open complaints / Open nonconformities / CAPA due ≤14d / Linguists under review); "Open nonconformities & CAPA" list; "Linguists to watch" performance table; "Log complaint" / "New nonconformity". NC detail at `/admin/quality/nc/{id}`.
- **Vendor detail** `/admin/vendors/{id}`: tabs Profile, Languages, Domains, Rates, Payment Setup, Invoices, Payments, Documents, Auth/Invitation, Agreements, **QMS**, Performance, Jobs, Communication. The **QMS tab** = NDA on file + Role qualifications (basis, Verified, qualified/re-qual dates, language pairs) + Evidence/proof (each Verified, View document, sha-256) + Evidence locker.
- **Vendors list** `/admin/vendors`: filters include **ISO Qualification** (Qualified / Ready for approval / Under review / Suspended / No qualification), **NDA** (Signed/No), Vendor Type, etc., and a DOCS column (CV/NDA badges).
- **Left nav** (long — scroll!): MAIN → TOOLS → AI → VENDORS → **QUALITY** (SOPs, Documents & Manuals, Qualification Queue, Qualification Approvals, Staff Competence, Linguist Trainings, Quality & Performance) → TRANSLATION REVIEW (Review Jobs, QM Certified) → TRANSCRIPTION.

---

## 6. The QMS document set already in the portal (built earlier this session)
In `/admin/documents` (all Published unless noted): **QM-001** Quality Manual v5.0, **QM-002** List of SOPs v6.0, **QP-001** Quality Policy v4.0; **CSV-001** Part-11 gap assessment, **CSV-002** validation summary v1.1; **IA-2026-001** Internal Audit Report; **CTS-REC-RST-002** Restore Test Record v1.2; **REG-SP-001** Sub-processor/data-residency register; **STMT-001** Inspection History & Records Retention v1.1; **SOP-017-A** BCDR Call-Tree v1.1; **JD-001** Staff Job Descriptions; **FORM-TR-001** Training & Competence Record template. `CTS-POL-005` (old backup policy) is marked **[SUPERSEDED → SOP-016]** and un-published.
In `/admin/sops`: **21 SOPs** incl. SOP-001 (Doc Control), 003 (Vendor Qual, consolidated v2), 008 (Cogdeb), 009 (Clinician Review), 011 (CAPA), 012 (Internal Audits), 013 (Mgmt Review), 014 (Data Security), 015 (Risk Mgmt), 016 (Backup), 017 (BCDR), 018 (Sub-processor), 019 (COA Qual), 020 (Vendor Inbox/AI Front-Desk), 021 (Front-Desk Escalations).
Source markdown for all of the above is in `docs/audits/2026-06-iqvia/`.

---

## 7. Findings logged this session
1. **❌ RETRACTED — "QMS pages not in left menu".** This was WRONG. The QMS pages ARE in the left nav under the **QUALITY** section (the nav is just long; my first `read_page` truncated it). **ACTION: the 4 Drive guides each say "not in the left menu yet — type the address." Correct that one line** to "left menu › QUALITY section › SOPs / Documents & Manuals / Quality & Performance." (The typed URLs still work, so the guides function — but the line is inaccurate. Must be edited by hand in each Google Doc, or re-create the guides, since the Drive MCP can't edit content.)
2. **🐛 Vendor search may not filter (TO CONFIRM).** On `/admin/vendors`, typing "Karine" in the Name/email search box did **not** visibly filter the list (it still showed other names). Could be debounce / needs Enter / or a real bug. Worth a proper check — staff rely on this search. (We routed Fayza's SOP-003 guide around it via the ISO-Qualification filter + a direct vendor link.)
3. **⚠️ COA qualification not surfaced on the vendor record.** COA approvals live in `cvp_translator_domains` (recruitment layer, keyed to `cvp_translators`, per language pair, with approval_source/approver/date + revocation — e.g. an IQVIA NC-1 de-scoping is logged). They do **not** appear on the vendor QMS tab the way general qualification does. **Recommend surfacing COA qualification on the vendor QMS tab before the audit** so IQVIA can see it on the linguist record. (Captured in the SOP-019 guide.)

---

## 8. REMAINING work — pick up here
**SOPs still to verify** (suggested approach per SOP):
- **SOP-012 Internal Audits** — `/admin/documents` → confirm **IA-2026-001** opens. (Quick doc check.)
- **SOP-014 Data Security** — partial: Fayza confirms individual logins + NDAs on linguist records; refer encryption/audit-trail/access to IT (Cital) / Raminder.
- **SOP-015 Risk Management** — read the SOP's §8 current-key-risks list; confirm it's real/sensible.
- **SOP-016 Data Backup & Recovery** — `/admin/documents` → confirm CTS-REC-RST-002 (restore test) + backup evidence open; refer config to IT.
- **SOP-017 BCDR** — `/admin/documents` → confirm SOP-017-A call-tree + restore test; refer plan realism to Raminder.
- **SOP-018 Sub-processor Mgmt** — `/admin/documents` → open REG-SP-001; confirm tools match reality + clinical files never emailed/AI'd.
- **SOP-020 Vendor Inbox / AI Front-Desk** — `/admin/vendors` → Vendor Communication inbox renders + shows inbound mail.
- **SOP-008 Cognitive Debriefing · SOP-009 Clinician Reviews · SOP-013 Management Review · SOP-021 Front-Desk Escalations** — **refer-out** (clinical/management/ops processes, not portal-judgeable): confirm with Raminder / clinical lead / ops.
- These are mostly `/admin/documents` checks → you can knock several out in one pass and produce light guides.

**Then Pass-2:** verification guide for `/admin/documents` itself (Quality Manual, CSV docs, audit report, registers, staff files) — confirm each opens and is current.

**Process Fayza's findings** as they come back; fix real portal issues.

---

## 9. User-side fill-ins (not blocking the doc set — Raminder to do)
- Staff CVs → populate **FORM-TR-001** + record training completions (this **closes CAPA-2026-00005** "Staff training completions not recorded").
- Phone/emails → **SOP-017-A** call-tree (contacts left as `[fill in]`; delegate = **Amrita Shah**, MD).
- DPA-executed ticks → **REG-SP-001** ("handle later").
- Retention figure → check vs MSAs (a brief look at one or two contracts; current position: sponsor owns + archives the TMF ≥25y, Cethos retains its own quality records ≥7y).
- **NC-2026-00006** (competence basis missing on 13 role quals) + **NC-2026-00004** (CAPA recording) are open CAPAs in `/admin/quality`.

---

## 10. Guardrails & constraints (do not violate)
- **Do NOT mention Usman Khan's individual subcontractor team** in any QMS/audit material. (Usman = documented partnership since ~2020; the roster detail is out of scope for this audit.)
- **Translator CV evidence is deferred to the ISO effort, NOT IQVIA** (user decision — don't chase it for this audit).
- **Qualification is irreversible** — inspect, never dummy-onboard.
- **CAPA/quality log is append-only** — look-only verification.
- The org (verified, 8 staff + partnership): **Raminder Shah** (Founder & CEO / Acting Quality Manager), **Amrita Shah** (Managing Director; BCDR emergency-recovery delegate), **Bobby Rawat** (Life Sciences Manager), **Ashish Garg** (Lead Vendor Manager), **Karan Verma** (Project Coordinator, Life Sciences, under Bobby), **Preeti Bisht** & **Fayza El Bezzari** (Account Managers), **Rishu Gupta** (Accounts, AP/AR). Maria Teressa no longer with Cethos (Raminder covers QM). Approval block on QMS docs: Prepared R. Shah (Acting QM) · Reviewed A. Shah (MD) · Approved R. Shah (Founder & CEO). IT = **Cital Enterprises** (external).

---

## 11. Git state at handover
**Committed to main this session** (branch → PR → merge): the `docs/audits/2026-06-iqvia/` QMS documents + this handover + the repo memory file (`memory/feature_iqvia_qms_verification_2026_06_25.md`) + 3 small reviewed source tweaks (AdminLayout QMS nav label, AdminVendorsList CD vendor-type filter, manage-sops sop_number collision fix).

**Deliberately NOT committed (held for review — they are NOT this session's work and were not reviewed):**
- `supabase/migrations/*.sql` (8 files, dated 0619–0624) — commit per the "apply-then-commit" convention once confirmed applied to prod.
- `supabase/functions/cvp-inbox-backlog-sweep/`, `supabase/functions/cvp-recruitment-pulse/` — new edge functions (couple with two of the migrations above).
- `e2e/` — Playwright harness; **may contain an auth/storage-state artifact with a session token — review/gitignore before committing.**
- `docs/training/`, `docs/sops/sharepoint-export/` — RWS/export docs from other work.
- `tmp/` and `~$*` Office lock files — junk; do not commit.

---

## 12. How to resume (next session, first moves)
1. Read this file + the harness memory topic file.
2. Confirm **Browser 1** is still logged into **admin.cethos.com** (Chrome MCP). If not, ask the user to log in.
3. Continue **§8**: walk the next SOP (suggest SOP-012 → the doc-check cluster 016/017/018, then SOP-020), create each verified guide as a Google Doc (consider a Drive folder).
4. **Fix the 4 existing guides' "not in the left menu" line** (§7 finding 1) — by hand in each Doc, or re-create.
5. Keep memory + this handover updated as you go.

*** END OF HANDOVER ***
