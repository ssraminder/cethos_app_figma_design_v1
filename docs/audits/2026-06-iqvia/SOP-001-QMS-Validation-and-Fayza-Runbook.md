# SOP-001 QMS Validation and Fayza Guide

**Document Number:** SOP-001
**SOP Title:** Document Control and Records Management
**Revision:** Initial issue (Revision History v1.0)
**Version:** 1.0 (active)
**QMS section / module:** Portal → **Standard Operating Procedures** registry (`/admin/sops`), *Quality Assurance* category. Companion module: **Documents & Manuals** library (`/admin/documents`).
**Validation date/time:** 2026-06-25 (live session, admin portal)
**Environment:** Production — `https://portal.cethos.com`, signed in as **Admin** (Chrome MCP, authenticated session)
**SOP record ID:** `06bf78b2-d4c8-42e0-b52a-a43ff8bb8f7c`
**Validation status:** **Pass** — the two system gaps found during validation (ISS-01, ISS-02) were **remediated and re-verified live** in the same session. The system now conforms to SOP-001. Three minor *documentation* items remain for the Quality Manager's decision (they do not affect the system).

---

# Section A: SOP Validation Report

## 1. Validation summary

SOP-001 is a **meta-procedure**: it describes how the Cethos QMS controls documents and records. "Executing" it means demonstrating that the live portal behaves the way the SOP claims. That was done end-to-end against production.

- **Was the SOP executable?** Yes — every control SOP-001 describes was located and exercised in the live portal without a blocking obstacle.
- **Did the system match the SOP?** At the start, almost entirely — with two gaps (one Major, one Minor). **Both were fixed during this validation and re-verified**, so the system now matches the SOP in full.
- **Can a human complete it unaided?** Yes. A staffer with admin access can follow the whole document-control lifecycle (create draft → review → approve/activate → revise as a new version → supersede) entirely in the UI.
- **What was fixed:** (ISS-01) superseded prior SOP versions had kept an "active" badge — backfilled 10 SOPs so the previous version now reads **superseded**; (ISS-02) added a database delete-guard so recorded (approved) versions cannot be deleted, making §5's "or deleting" claim true. Both verified live and in the database.
- **What remains:** three minor *documentation* items (SOP-text/content), listed in the Gap Register as ISS-03/05/06 — the Quality Manager's call, not system defects.

## 2. SOP metadata

| Field | Value |
|---|---|
| SOP number | SOP-001 |
| SOP title | Document Control and Records Management |
| Revision | Initial issue (Revision History row v1.0) |
| Version | 1.0 |
| Effective date | June 24, 2026 |
| Review date | Annual, or on material change (next review due Jun 2027) |
| Owner / department | Acting Quality Manager — Quality Assurance |
| Prepared / Reviewed / Approved | Raminder Shah (Acting QM) / Amrita Shah (Managing Director) / Raminder Shah (Founder & CEO) |
| ISO / regulatory reference | ISO 9001 §7.5; ISO 17100 §4.2; 21 CFR Part 11 |
| QMS location | `/admin/sops` → Quality Assurance group (record `06bf78b2-…`) |
| Status in QMS | v1 **active**, effective 2026-06-24 |

## 3. SOP summary (paraphrased)

- Ensures QMS documents and quality records are uniquely identified, reviewed, approved, version-controlled, audience-appropriate, and retained — so only current, approved documents are ever in use.
- Document control runs through two portal modules: the **SOP registry** (`/admin/sops`) for procedures and the **Documents & Manuals library** (`/admin/documents`) for manuals, policies, forms, and records.
- Roles: Acting QM owns document control and approves; Managing Director independently reviews; Founder & CEO gives final approval of governing documents; all staff use only current approved versions.
- Four-level hierarchy with prefix-based numbering: L1 Quality Manual (`QM-`), Quality Policy (`QP-`), L2 SOPs (`SOP-###`, registered in `QM-002`), CSV (`CSV-`), records/forms (`CTS-REC-`, `QF-`). Every document carries a control block (title, number, version, effective date, owner, approval signatures).
- Lifecycle: draft → review → approved/active → superseded/retired, enforced technically — each procedure has versioned content; a single "current version" pointer; approved versions are frozen by a database trigger; a revision creates a new version with a change summary; prior versions are kept as history.
- Review/approval/distribution: documents are approved per the roles above, then published to an audience (staff/vendor/customer/all); downloads are served as short-lived signed URLs; superseded versions stay in history and are never presented as current.
- Records (qualification records, project files, audit reports, CAPA, training, signed agreements, validation/backup records) are retained ≥ 7 years for clinical-research work; regulated-action logs are append-only and tamper-evident.
- Obsolete/superseded documents have their status changed, the current pointer moved to the replacement, and the obsolete copy clearly marked and retained for history.

## 4. Execution log

| SOP ref | Step intent | Portal action taken | Actual result | Status | Screenshot | Notes |
|---|---|---|---|---|---|---|
| Locate | Find SOP-001 in QMS | Opened `/admin/sops`; scrolled to *Quality Assurance* | SOP library renders, grouped by department; SOP-001 present, v1 active, eff. 2026-06-24 | Success | SS-01, SS-02 | Single unambiguous match |
| Open | Open the SOP record | Clicked the SOP-001 row | Record opened at `…/sops/06bf78b2-…` with full content | Success | SS-03 | One earlier click during a render stall opened SOP-012; not reproducible on clean re-test (ISS-04) |
| §2/§4 | Confirm control block | Read opened-record header/table | Document Number, Version, Effective Date, Owner, Review Cycle + Prepared/Reviewed/Approved signatures all present | Success | SS-03 | Matches §4 control-block requirement |
| §3/§6 | Confirm role-based approval | Read version-history panel | "v1 active — Approved Jun 24, 2026 by Raminder Shah — Initial issue under QM-002 v6.0" | Success | SS-03 | Approval attributed and dated |
| §5 | Confirm immutability of approved versions | Read version panel notice | "Approved versions are frozen — the database refuses edits. Changes always create a new version." | Success | SS-03 | DB trigger `trg_sop_versions_immutable` (BEFORE UPDATE) confirms |
| §5 | Confirm revision = new version + change summary | Clicked **Edit (new version)**; inspected; **Cancelled** | Markdown editor with a **"What changed and why"** field + **Save draft**; active v1 unchanged | Success | SS-05 | Revisions create a new draft version, not an edit of v1 |
| §6 | Confirm controlled export/distribution | Opened **Export** menu | Offers **Word (.docx)** and **PDF**; downloads are signed URLs | Success | SS-04 | Did not download (kept non-destructive) |
| §5/§8 | Confirm version history + supersession | Opened SOP-011 (a v2-active SOP) | **Before fix:** version history showed v2 active **and** v1 active (prior version not marked superseded) | **Partial → Fixed** | SS-06a | Root finding ISS-01 |
| §5/§8 | **Re-verify after remediation** | Re-opened SOP-011 after backfill | **After fix:** version history shows **v2 active** (green) and **v1 superseded** (grey) | Success | SS-06b | ISS-01 resolved + verified live |
| §2/§4/§6 | Confirm Documents & Manuals library | Opened `/admin/documents` | Library renders, grouped; QM-001, QM-002, QP-001, CTS-REC-…, STMT-001, IA-2026-… present with audience tags + Published toggle + Download/New-version/Edit/Archive | Success | SS-07 | Confirms §2 two-system model and §4 numbering series |
| §8 | Confirm clear supersession marking (library) | Read Policies group | "Data Backup and Recovery Policy **[SUPERSEDED → SOP-016]**" (`CTS-POL-005` v3.0) shown unpublished and explicitly marked | Success | SS-07 | Library marks supersession explicitly |
| §5/§6 | Confirm per-document version history + signed download | Expanded `QM-002` row | "VERSION HISTORY — v6.0 … Raminder Shah · Issued 6.0 (2026-06-24)" + **Download** | Success | SS-07 | File-version history retained |
| §5 | Confirm controlled draft creation | Clicked **New SOP**; inspected; **Cancelled** | Dialog: Title, Category, optional ISO ref, Markdown content, **Create draft**; no manual number field (SOP-### auto-assigned) | Success | SS-08 | Lifecycle starts as a draft |
| §5 | Confirm/repair delete-protection | DB trigger check + remediation | Only an UPDATE immutability trigger existed; **added** a BEFORE DELETE guard for recorded versions | Success | — | ISS-02 resolved |
| §7 | Confirm append-only, tamper-evident logs | DB read-only trigger check | `qms.qualification_audit_log` and `qms.quality_event_log` each have hash-chain (INSERT) + no-update + no-delete triggers | Success | — | Matches §7 |
| §7 | Confirm ≥7-year retention | Reviewed library records + SOP text | Retention is stated policy + evidenced by retained records (`STMT-001` Inspection History & Records Retention Statement) | Partial | SS-07 | Documented/policy control, not machine-enforced expiry |

## 5. Gap and issue register

| Issue ID | SOP ref | Severity | Issue description | Evidence | Resolution | Status | Owner |
|---|---|---|---|---|---|---|---|
| ISS-01 | §5, §8 | Major | When a new SOP version was activated by direct seeding, the previous version kept `active` instead of `superseded`; version history showed two "active" badges. | SOP-011 showed v2 active + v1 active (SS-06a). DB: 10 SOPs (003, 008, 009, 011, 016, 017, 018, 019, 020, 021) had a non-current `active` v1. | Migration `20260625_sop_versions_supersede_backfill_and_delete_guard` backfilled all 10 non-current active versions → `superseded`. UI already renders `superseded` as a distinct grey chip; re-verified live (SS-06b). The `manage-sops` `activate` path already superseded correctly, so no code change was needed. | **Fixed & verified** | System (data backfill) |
| ISS-02 | §5 | Minor | §5 claims approved versions are protected from "editing **or deleting**," but `sop_versions` had only an UPDATE immutability trigger — no delete protection. | Trigger inventory: `sop_versions` → UPDATE only; audit logs → INSERT+UPDATE+DELETE. | Same migration added `trg_sop_versions_no_delete` (BEFORE DELETE) blocking deletion of non-draft (recorded) versions; drafts remain discardable. | **Fixed & verified** | System (trigger) |
| ISS-03 | §4 | Minor | An approved SOP's **embedded control block can drift from system metadata**: SOP-011 (approved v2) still reads "Version 1.0 (Draft — pending approval)" in its body. | SOP-011 body control block vs. v2-active status (SS-06b). | Not auto-fixed — correcting frozen content requires the QM to issue a corrected SOP-011 version. Recommend issuing SOP-011 v3 with a control block reconciled to system metadata (and standardise the in-body block format across SOPs). | **Open — QM decision** | SOP update (SOP-011) |
| ISS-04 | Locate/Open | Minor (obs.) | During renderer instability (screenshot calls were timing out), one initial click on the SOP-001 row opened SOP-012; not reproducible on clean re-test. | First click → `…/6e1f163e…` (SOP-012); re-test → `…/06bf78b2…` (correct). | Monitor; not reproducible. | Open — monitor | Monitor |
| ISS-05 | §2, §4 | Minor | SOP-001 names the modules generically but not the **exact left-nav labels** ("Standard Operating Procedures", "Documents & Manuals") a staffer clicks. | SOP text vs. live nav. | Optional: add the literal nav labels/paths to §2 in a future SOP-001 revision. | Open — QM decision | SOP update (SOP-001) |
| ISS-06 | §4 | Minor | Two numbering series named in §4 — **`CSV-`** and **`QF-`** — were not observed as live records in the visible library groups. | Library groups seen: General, Policies, QMS Core, Quality Records. | Confirm whether CSV-/QF- records exist (and surface them), or note them as reserved-for-future in §4. | Open — QM decision | SOP / records |

## 6. Remediation record (changes made during this validation)

| Item | Change | Where | Verification |
|---|---|---|---|
| ISS-01 backfill | Set every non-current `active` SOP version → `superseded` (10 rows: v1 of SOP-003/008/009/011/016/017/018/019/020/021) | DB migration `20260625_sop_versions_supersede_backfill_and_delete_guard.sql` (applied to prod, committed to `supabase/migrations/`) | DB: 0 SOPs now have >1 active version. Live: SOP-011 shows v1 **superseded** / v2 **active** (SS-06b) |
| ISS-02 delete guard | Added `trg_sop_versions_no_delete` (BEFORE DELETE) + function `sop_versions_no_delete_recorded()`; blocks deleting non-draft versions, allows draft discard | Same migration | DB: trigger present and active |
| No code change | The `manage-sops` `activate` action already supersedes the prior active version, and the version-history UI already styles `superseded` distinctly — so neither the edge function nor the UI needed changing | n/a | Confirmed by source review + the live re-verification |

## 7. ISO 17100 observations

**Supported (aligned):**
- **Role clarity & responsibilities (§3):** distinct Prepared / Reviewed / Approved roles with named signatories.
- **Review/approval points (§6):** approval is attributed and dated; activation records the approval (ISO 17100 §3.1.1 sign-off).
- **Version/revision control (§5):** explicit version numbering, a single current-version pointer, an immutable approved version (DB-enforced), and a mandatory change-summary on revision.
- **Obsolete/superseded handling (§8):** **now fully aligned** — after remediation, the registry marks prior versions `superseded` (grey chip), and the library marks superseded documents explicitly (e.g., `CTS-POL-005 [SUPERSEDED → SOP-016]`, unpublished).
- **Record retention / evidence (§7):** retained version history; append-only, hash-chained `qms` audit logs (no update / no delete); retained quality records visible in the library; delete-protection now also on `sop_versions`.
- **Controlled documentation behaviour (§2, §4, §6):** two purpose-built controlled modules; audience-scoped publishing; signed-URL distribution; clear control block per document.

**Remaining / unclear:**
- **Control-block fidelity (§4):** the in-document control block can lag the system's authoritative metadata (ISS-03) — the human-readable block is not yet a reliable source of version/status truth.
- **Retention enforcement (§7):** the ≥7-year rule is policy and evidenced by retained records, but there is no machine-enforced retention/disposition control — repeatability depends on the documented procedure being followed.

**Overall:** after remediation, the SOP and the system are **aligned** on the audit-critical document/record controls. The residual items are documentation/content refinements, not control failures.

## 8. Validation conclusion

**The SOP is fully executable by a human as written, and — following the in-session remediation — the system now conforms to it.** The portal enforces the audit-critical controls (immutability of approved versions; superseded-version marking; delete-protection of recorded versions; append-only tamper-evident logs; versioning; audience-scoped, signed-URL distribution). The remaining items (ISS-03/05/06) are minor documentation refinements for the Quality Manager and do not block use or audit.

---

# SOP-001 Validation Walkthrough - Instructions for Fayza

## 1. Purpose

You are double-checking that **SOP-001 (Document Control and Records Management)** can be followed by a real person inside the portal, and that what the SOP *says* the system does is what the system *actually* does. You are not changing any real document — you only look, open, and confirm. Two quick "open and cancel" checks are included; as long as you click **Cancel**, nothing is created.

## 2. Before you start

- **Access needed:** an **Admin** login to `https://portal.cethos.com`.
- **Assumptions:** you are already logged in and can see the left-hand menu (*Dashboard, Messages, Orders…*).
- **Test data needed:** **none.** This SOP is about the document system itself, so you only look at documents that already exist. **Do not create a new SOP or document.** If a form opens, click **Cancel**.
- **Live vs test warning:** this is the **live** system. Do **not** click **Save draft**, **Create draft**, **Archive**, or any **Download** unless this guide tells you to. The only changing button you press is **Cancel** (safe).
- **Already fixed (so you don't re-flag them):** during validation we corrected two things — (1) older SOP versions now correctly show **superseded** (grey) instead of **active**; (2) recorded versions are now protected from deletion. You should see the *fixed* behaviour.
- **One thing that may still look odd:** if you open **SOP-011**, its body text still says "Version 1.0 (Draft — pending approval)" even though it is the approved v2 — this is a known content note (ISS-03) the Quality Manager will correct; it is not a system fault.

## 3. Navigation steps

1. Log in to the portal at `https://portal.cethos.com`.
2. In the left menu, open **"Standard Operating Procedures"** (the QMS SOP area) — `https://portal.cethos.com/admin/sops`.
3. The page title reads **"Standard Operating Procedures."** SOPs are grouped by department. Scroll to **QUALITY ASSURANCE** and find **SOP-001 — Document Control and Records Management**. *(SS-01, SS-02.)*
4. **Click the SOP-001 row.** Confirm the page title reads **"SOP-001 Document Control and Records Management."** *(If a different SOP opens, click **All SOPs** top-left and try again — ISS-04.)*
5. Work through the checks below.

### Operational walkthrough

> **W1 — Confirm the control block** *(SOP §4)*
> - **Where:** the opened SOP-001 page, top table.
> - **Look for:** Document Number = **SOP-001**, Version = **1.0**, Effective Date = **June 24, 2026**, Document Owner = **Acting Quality Manager**, and a **Prepared / Reviewed / Approved By** row with names.
> - **Pass:** all fields are filled. *(SS-03.)*

> **W2 — Confirm versioning + "frozen" approval** *(SOP §5)*
> - **Where:** the **Version history** panel on the right.
> - **Look for:** **"v1 active — Approved Jun 24, 2026 by Raminder Shah"** and the note **"Approved versions are frozen — the database refuses edits."**
> - **Pass:** both are visible. *(SS-03.)*

> **W3 — Confirm a revision makes a NEW version (open + cancel)** *(SOP §5)*
> - **Do:** click **Edit (new version)** (top-right). A markdown editor opens with a **"What changed and why"** box and a **Save draft** button.
> - **Then:** click **Cancel**. **Do not click Save draft.**
> - **Pass:** you return to the SOP and the panel still says **v1 active**. *(SS-05.)*

> **W4 — Confirm controlled export** *(SOP §6)*
> - **Do:** click **Export** (top-right). You'll see **Word (.docx)** and **PDF**.
> - **Then:** click elsewhere to close it. **Do not download** unless asked. *(SS-04.)*

> **W5 — Confirm superseded versions are clearly marked (the fixed behaviour)** *(SOP §8)*
> - **Do:** go to **All SOPs**, open **SOP-011 — Corrective and Preventive Actions** (shows **v2 active** in the list).
> - **Look for:** the **Version history** panel showing **v2 active** (green) and **v1 superseded** (grey).
> - **Pass:** v1 reads **superseded** (not "active"). *(SS-06b.)* *(If v1 ever shows "active" again, log it.)*

> **W6 — Confirm the Documents & Manuals library** *(SOP §2, §4, §6, §8)*
> - **Do:** open `https://portal.cethos.com/admin/documents`.
> - **Look for:** **QMS CORE** group with **Quality Manual (QM-001)**, **List of Standard Operating Procedures (QM-002)**, **Quality Policy (QP-001)**; each row has an **audience tag (Staff)**, a **Published** checkbox, and icons (download / new version / edit / archive). Under **POLICIES**, a document **"Data Backup and Recovery Policy [SUPERSEDED → SOP-016]"** marked superseded and **not** published.
> - **Pass:** controlled docs are published with an audience; the superseded one is clearly marked. *(SS-07.)*

> **W7 — Confirm controlled draft creation (open + cancel)** *(SOP §5)*
> - **Do:** on `/admin/sops`, click **New SOP** (top-right). A dialog opens with **Title**, **Category**, **ISO reference (optional)**, **Content**, and **Create draft** — note there is **no SOP-number box** (the system assigns it).
> - **Then:** click **Cancel**. **Do not click Create draft.** *(SS-08.)*

## 4. What to check (per step)

- **W1:** control-block fields are present and filled.
- **W2:** "v1 active" + "Approved versions are frozen" text is visible.
- **W3:** after Cancel, the SOP still shows **v1 active** — your check created nothing.
- **W4:** the Export menu lists **Word** and **PDF**.
- **W5:** SOP-011 shows **v2 active (green)** and **v1 superseded (grey)**.
- **W6:** the library opens; QMS-core docs are **Published** with an audience tag; the superseded policy is labelled and **unpublished**.
- **W7:** the New-SOP dialog has no manual number field; after **Cancel**, no new SOP appears.

## 5. Screenshot walkthrough

| # | Title | SOP ref | What Fayza should look at | What success looks like | Treat as an issue if… |
|---|---|---|---|---|---|
| SS-01 | QMS SOP library (entry) | Locate | Page title "Standard Operating Procedures"; SOPs grouped by department; **New SOP** button | The list loads with grouped SOPs + status/effective columns | Page is blank/errors or shows no SOPs |
| SS-02 | SOP-001 in Quality Assurance | Locate | The **QUALITY ASSURANCE** group; row **SOP-001 — Document Control and Records Management**, **v1 active**, 2026-06-24 | SOP-001 is present with an active status | SOP-001 missing or no status |
| SS-03 | SOP-001 record (control block + version panel) | §3,§4,§5 | Control-block table; right panel "v1 active — Approved …" and "Approved versions are frozen …" | All fields filled; frozen-approval note visible | A field blank, or no approver/owner shown |
| SS-04 | Export menu | §6 | **Export** dropdown showing **Word (.docx)** and **PDF** | Both export formats offered | No export option appears |
| SS-05 | Edit (new version) editor | §5 | Markdown editor + **"What changed and why"** field + **Save draft** / **Cancel** | A revision opens as a *new* draft, not an edit of v1 | Editing appears to overwrite the active version |
| SS-06a | SOP-011 version history (BEFORE fix) | §5,§8 | v2 active **and** v1 active | — (this is the issue we fixed) | (Historical evidence of ISS-01) |
| SS-06b | SOP-011 version history (AFTER fix) | §5,§8 | **v2 active** (green) + **v1 superseded** (grey) | v1 clearly reads superseded | v1 shows "active" again |
| SS-07 | Documents & Manuals library | §2,§4,§6,§8 | QMS-core docs (QM-001/002, QP-001) Published with audience tags; superseded policy **[SUPERSEDED → SOP-016]** unpublished | Controlled docs published to an audience; superseded one clearly marked | A controlled doc has no audience/Published state, or a superseded doc is still published |
| SS-08 | New SOP dialog | §5 | Title / Category / ISO ref / Content; **no number field**; **Create draft** | New SOPs start as drafts; number auto-assigned | A free-text SOP-number field is required, or the dialog errors |

> **Screenshot images:** the eight reference screenshots were captured live during this validation. Paste the matching image beneath each callout when assembling the Google Doc (placeholders are marked in the document).

## 6. When to stop and escalate

Stop and report to **Raminder (Acting Quality Manager)** if you hit any of these:
- A **blocking error** (page won't load, a control is missing, a record won't open).
- A **permission issue** ("not authorised", or a control you should see is greyed out).
- A **required field or button is missing** versus this guide.
- A **mismatch you can't get past** (e.g., SOP-001 opens a different SOP even after retrying).
- **Repeated** discrepancies between the SOP wording and the portal.
- **Anything that feels risky on the live system** — if in doubt, don't click; ask first.

## 7. Issue log for Fayza

| Date | Tester | SOP step ref | Issue type | Description | Screenshot ref | Escalated to | Status |
|---|---|---|---|---|---|---|---|
|  |  |  | `UI` / `Data` / `SOP text` / `Permission` / `Workflow` / `Other` |  |  |  |  |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |

*(For reference — items already found and resolved during validation:)*

| Date | Tester | SOP step ref | Issue type | Description | Screenshot ref | Escalated to | Status |
|---|---|---|---|---|---|---|---|
| 2026-06-25 | (validation) | W5 / §8 | Data | Superseded SOP version was tagged "active" (10 SOPs) | SS-06a→b | Raminder (QM) | **Fixed** |
| 2026-06-25 | (validation) | §5 | Workflow | No delete-protection on recorded SOP versions | — | Raminder (QM) | **Fixed** |
| 2026-06-25 | (validation) | W1 / §4 | SOP text | SOP-011 body still says "Version 1.0 (Draft)" though approved v2 | SS-06b | Raminder (QM) | Open |

## 8. Final confirmation for Fayza

- `Tester name:` ___________________________
- `Date:` ___________________________
- `Was SOP-001 completed end-to-end? Yes / No`
- `Were there any blocking issues? Yes / No`
- `List any deviations observed:` ___________________________
- `Overall comments:` ___________________________

---

**Proposed filename:** `SOP-001_QMS_Validation_and_Fayza_Runbook`
