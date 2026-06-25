# QMS Document Reconciliation Crosswalk — 2026-06-24

**Purpose:** reconcile the **divergent live SOP set** (portal `public.sops` + SharePoint "02 SOPs" + the `CTS-*` docs, all created Jun 2026) back onto the **canonical RFQ register** that IQVIA holds (QM-001 Quality Manual v4.0, **QM-002 List of SOPs v5.0**, QP-001 Quality Policy v3.0). Per directive: new docs **match/improve** the RFQ baseline and **version from it**.

**Decisions applied:** (1) new IT/continuity docs **extend the SOP register** (SOP-016+); (2) reconcile the live SOPs **now**.

---

## 1. The conflict
- **IQVIA holds QM-002 v5.0**, which registers **SOP-001…015** as the *translation/clinical process* SOPs (Document Control, Forward Translation, CAPA, Internal Audits, …).
- **The live system** (portal + SharePoint) instead has a *qualification/IT-focused* SOP set that **reuses numbers 001–007 for different documents** (e.g. live SOP-005 = "IT Sub-processor Management" vs RFQ SOP-005 = "Forward Translation Process v4.0").
- **Result:** the register IQVIA was given does not match the SOPs that actually exist. Reconciliation = make one coherent register in the RFQ house style.

## 2. Crosswalk — every live document → canonical home
"Action" is a pure **renumber/retitle** (content preserved); no documents are deleted.

| Live doc (current) | Topic | → Canonical SOP | Action | Rationale |
|---|---|---|---|---|
| portal/SP **SOP-007** "CAPA & complaint handling" | CAPA | **SOP-011** Corrective & Preventive Actions (CAPA) | renumber+retitle | RFQ SOP-011 is the CAPA topic; live doc is its current content |
| portal **SOP-PR-001** "Cognitive debriefing" | Cog debriefing | **SOP-008** Cognitive Debriefing | renumber | RFQ SOP-008 topic match |
| portal **SOP-PR-002** "Clinician review" | Clinician review | **SOP-009** Clinician Reviews | renumber | RFQ SOP-009 topic match |
| portal/SP **SOP-005** "IT/Service Sub-processor Mgmt" | IT supplier | **SOP-018** IT / Service Sub-processor Management | renumber | New topic — extends register |
| portal/SP **SOP-006** "COA LV qualification" | COA qual | **SOP-019** COA Linguistic Validation Qualification | renumber | New topic — extends register |
| portal/SP **SOP-IT-001** "Vendor inbox & AI front desk" | Mail infra | **SOP-020** Vendor Inbox & AI Front-Desk (Mail Infrastructure) | renumber | New topic — extends register |
| portal/SP **SOP-OPS-001** "Answering AI front-desk escalations" | Ops | **SOP-021** Answering AI Front-Desk Escalations | renumber | New topic — extends register |
| portal/SP **SOP-001** "Qualify translators & revisers" | Vendor qual | **SOP-003** (consolidate) *or* **SOP-022** | see §3 | Detail of RFQ SOP-003 Vendor Qualification |
| portal/SP **SOP-002** "Keep qualifications up to date" | Requal | **SOP-003** (consolidate) *or* **SOP-023** | see §3 | Detail of RFQ SOP-003 |
| portal/SP **SOP-003** "Approval authority & QA oversight" | Approval | **SOP-003** (consolidate) *or* **SOP-024** | see §3 | Detail of RFQ SOP-003 |
| portal/SP **SOP-004** "Linguistic Resource (Supplier) Mgmt" | Vendor mgmt | **SOP-003** (consolidate) *or* **SOP-025** | see §3 | Detail of RFQ SOP-003 |
| **CTS-POL-005** "Data Backup & Recovery Policy" v3.0 | Backup | **SOP-016** Data Backup & Recovery | reformat → house style | New topic — extends register; v3.0 history carried in revision table |
| **BCP-001** (my draft) "Business Continuity & DR Plan" | Continuity | **SOP-017** Business Continuity & Disaster Recovery | reformat → house style | New topic — extends register |
| **CTS-REC-BKP-001**, **CTS-REC-RST-001** | Records | (not SOPs) Level-4 **quality records** under SOP-016 | keep | Evidence, not procedures |

## 3. The one judgment call — the vendor-qualification cluster
Four live SOPs (qualify translators · keep current · approval authority · linguistic-resource mgmt) are all facets of RFQ **SOP-003 Vendor Qualification & Management**. Two ways to reconcile:
- **(A) Consolidate (recommended):** they become the current content of **SOP-003** (one umbrella SOP, v5.0). Cleanest register (total 21 SOPs), matches the RFQ topic exactly. Requires merging four short docs into one.
- **(B) Keep distinct:** renumber to **SOP-022…025**, each cross-referencing SOP-003. No content merge (pure renumber), but inflates the register to 25 and splits one RFQ topic across five SOPs.

## 4. Proposed reconciled register → **QM-002 v6.0**
SOP-001…015 keep the RFQ topics/numbers; SOP-016…021 are the new extensions. (Drafted in house style in `QM-002-list-of-sops-v6.0.md`.) Some RFQ SOPs are "Registered" (topic owned, full document still to be authored) vs "Active" (authored and live) — stated honestly in the register.

## 5. Execution sequence (after you confirm the §3 choice)
1. Publish **QM-002 v6.0** (master register, house style) — supersedes v5.0.
2. Reformat **CTS-POL-005 → SOP-016** and **BCP-001 → SOP-017** into QM-001 house style (tri-signature, revision history). SOP-016 revision history carries the CTS-POL-005 v1.0→3.0 lineage.
3. Apply the renumber/retitle to the live **portal `sops`** table (reversible; old→new recorded here) and align the **SharePoint "02 SOPs"** filenames.
4. Re-point the portal Documents entry (CTS-POL-005 → SOP-016) and add SOP-017.

**Reversibility:** every portal change is a renumber/retitle with the old value recorded in this crosswalk; nothing is deleted.
