# TRN-RWS-001 — Onboarding an RWS Linguistic-Validation PO (staff training)

| | |
|---|---|
| **Document ID** | TRN-RWS-001 |
| **Title** | Onboarding an RWS Linguistic-Validation PO into the portal — staff training |
| **Owner** | Quality / Operations |
| **Audience** | Staff (LV operations / project management) |
| **Status** | Draft v0.2 — 2026-06-26 *(updated for the team-Dropbox per-workflow folder structure + post-delivery revision rounds & billing; screenshots embedded in the controlled .docx)* |
| **Related** | SOP-LV-001 (master LV SOP) · SOP-PR-003…011 (per-step SOPs) · the task→template map below |

---

## 1. Purpose & who this is for

This guide trains **Cethos LV operations and project-management staff** to onboard a **single RWS Life Sciences purchase order (PO)** into the portal, correctly and repeatably, so the record is ISO 17100-defensible for audit. Read SOP-LV-001 first for the *why*; this guide is the *how, click by click*.

> **One rule to remember:** **1 RWS PO = 1 Cethos order = one LV step + one independent internal QA.** RWS manages the full validation cycle and buys *individual steps* from us. We never chain steps and never email RWS an order confirmation — they already sent the PO.

## 2. The end-to-end flow

```
PO arrives (lv@cethos.com)
   └─► 1. Read the PO  →  2. Map task code → service + workflow template
        └─► 3. Create the order (un-delivered shell)  →  4. Pre-production record (§4.4)
             └─► 5. Assign the qualified vendor  →  6. Production + independent QA
                  └─► 7. Deliver to client  →  8. Complete + archive
```

## 3. Step 1 — A PO arrives

RWS POs land in **lv@cethos.com**, auto-generated, subject `RWS Life Sciences, Inc. PO: <PO#> for <project> Issued`, sender = the assigning PM's `@rws.com` address.

> `[SCREENSHOT 1: the PO email in the lv@cethos.com inbox]`

## 4. Step 2 — Read the PO

Every PO body has a header block and a one-line-item rate table. Capture these **six fields**:

| Field in the PO | Use it for |
|---|---|
| **Purchase Order: `<PO#>`** | the order's PO number |
| **Assigned By** | the **client PM** (create/select this person under the RWS company) |
| **Date** | PO date |
| **Scope** | the study/protocol (record in the pre-production note) |
| **Project Number** (e.g. `251-E4006A-EILV`) | the **client project number** (internal project) |
| Line item: **instrument** (e.g. *eCOA Text*) · **task code** (e.g. *TRLV – Translation (LV)*) · **language pair** (e.g. *English (United States)→Marathi (India)*) · **Total Authorized in US Dollars** | the **service + workflow**, the **languages**, and the **amount** |

> `[SCREENSHOT 2: a PO body with the six fields highlighted]`

## 5. Step 3 — Map the task code → service + workflow template

The **task code** (left of the dash in the grey row) drives the service and the workflow template:

| RWS task code | Cethos service | Workflow template | QA basis (ISO 17100) |
|---|---|---|---|
| **TRLV** – Translation (LV) | Standard Translation | `translation_only` | §5.3.3 revision |
| **EDAD** – Adapt | Standard Translation | `lv_adaptation` | §5.3.3 revision |
| **BTLV** – Back Translation | Back Translation | `lv_back_translation` | §5.3.3 revision |
| **pPRF** – Paper Proofreading | Proofreading | `lv_proofreading` | §5.3.6 verification |
| **ePRF** – eCOA Proofreading | Proofreading | `lv_proofreading` | §5.3.6 verification |
| **HARM** – Harmonize | Harmonization | `lv_harmonization` | §5.3.6 verification |
| **IIP** – Interview / **RSub** – Recruit Participants | Cognitive Debriefing | `lv_interview` | §5.3.6 verification |
| Cognitive Debriefing | Cognitive Debriefing | `cognitive_debriefing` | §5.3.6 verification |
| Clinician Review | Clinician Review | `clinician_review` | §5.3.6 verification |
| (REC) Reconciliation | Reconciliation | `lv_reconciliation` | §5.3.6 verification |
| (BT review) | Translation Review | `lv_bt_review` | §5.3.6 verification |
| (Finalization / Certification) | Quality Management | `lv_finalization` | §5.3.6 verification |

> The LV-type suffix on the project code (EILV, NVLV, ABVLV, EUQLV, ZELV…) is an **RWS internal code, not a workflow** — ignore it for template selection.

## 6. Step 4 — Create the order (un-delivered shell)

Create the order against the **RWS USD, tax-exempt** customer with these settings:

- **Customer:** RWS Life Sciences (USD, tax-exempt, net-30). *Do not send a customer order-confirmation email.*
- **Service:** per the map (Step 3).
- **Workflow template:** the LV template per the map — this gives the three nodes **`<step> → QA Review → Final Deliverable`**.
- **Source / Target languages:** the PO's language pair (e.g. English (US) → Marathi (India)). If a regional variant isn't in the list yet, raise it with the system admin to add (e.g. Tamil (India)).
- **PO number / Client project number / Amount (= Total Authorized) / Client PM (= Assigned By).**
- **Status:** **In Production**, work status **Pending** — an un-delivered shell. (No deliverable yet; do not mark delivered.)

> `[SCREENSHOT 3: create-order form with customer=RWS, service, and workflow template selected]`
> `[SCREENSHOT 4: language pair, PO#, project number, amount, and PM fields filled]`

## 7. Step 5 — Pre-production record (§4.4)

On the new order, add a **staff note** capturing the client–TSP agreement (ISO 17100 §4.x): client (RWS) + PO#, project, study, service, source/target, amount, and that **independent QA** will occur before release. This is the pre-production audit record.

> `[SCREENSHOT 5: the pre-production staff note on the order]`

## 8. Step 6 — Assign the qualified vendor (when work starts)

On the **production step** (step 1), use **Find Vendor** and assign a linguist who is **ISO-qualified for that language pair and role** in the QMS roster. **Never assign an unqualified linguist** — the eligibility gate enforces this; do not override it.

> `[SCREENSHOT 6: Find Vendor on the production step]`

## 9. Step 7 — Production + independent QA

The vendor produces the step and uploads the deliverable. Then the **QA Review** node (step 2) is performed by an **independent second person** (default **Bobby Rawat**) — **a different person than the producer**:

- **Translation / adaptation / back-translation** → a **§5.3.3 bilingual revision** by a second qualified linguist.
- **All validation / review steps** (reconciliation, BT review, harmonization, proofreading, interview, clinician review, finalization) → **§5.3.6 verification & release**.

> `[SCREENSHOT 7: the three workflow steps showing QA Review assigned to the internal reviewer]`

## 10. Step 8 — Deliver + complete

On QA approval, upload the released version to the **Final Deliverable** node, deliver to the client, and complete the order. Files live in the **Cethos team Dropbox**, auto-organised per order into a **per-workflow, per-step, versioned** structure:

```
Cethos Team Folder/01_Clients/RWS/{PRJ-2026-NNNNN} - {client project code}/
└── {ORD-2026-NNNNN} - {Service} - {src-tgt} - {date}/
    ├── 00_Admin/                 PROJECT-RECORD.md (the audit record) + the order's invoice/PO PDFs
    ├── 01_Source/v1/             the source files RWS sent
    ├── 02_Reference/v1/          instructions / reference / working files
    ├── 10_{Step}/v1/             the LV step's deliverable (10_Translation, 10_Adaptation, 10_Proofreading, 10_Harmonization, …)
    ├── 20_QA-Review/v1/          the QA-approved copy
    └── 30_Final-Deliverable/v1/  the released copy
```

- **Every workflow step is its own numbered folder** (`10_`, `20_`, `30_` — step × 10), and **every folder is versioned** (`v1`, `v2`, …). A revision round re-versions the affected step to `v2`/`v3`; **`v1` is never overwritten** (see §11). Post-delivery client feedback adds a **`05_Client-Review/round-N/`** folder.
- Use **"Sync"** (top of the order detail) to refresh the folder; **"Open in Dropbox"** jumps to it. Records are retained **≥ 5 years** (ISO 17100 §6.2).

> `[SCREENSHOT 8: the order's team-Dropbox folder — breadcrumb "Cethos Team Folder ▸ 01_Clients ▸ RWS ▸ PRJ-2026-00031 - 261-A2229A-EILV ▸ ORD-2026-10227 …", listing 00_Admin / 01_Source / 02_Reference / 10_Translation / 20_QA-Review / 30_Final-Deliverable]`

## 11. Review rounds, revisions & post-delivery changes

RWS work is iterative — developer/clinician feedback and query rounds are normal, and they often arrive **after** we've delivered. Handle every one as a **controlled revision round**, never a silent re-send. (Full process + ISO basis: **SOP-026 — Post-Delivery Client Review & Revision Rounds**.)

**a) Always log the client's return first (§6.1).** Paste each RWS email into the order's **Client Communications** tab — **append-only**, **back-date** it to RWS's send time, and **attach their markup/feedback files**. This is the ISO 17100 §6.1 record, and it is what **populates the `05_Client-Review/round-N/`** folder (a `feedback.md` of the request + the attachments). The portal can auto-generate the vendor brief from it.

> `[SCREENSHOT 9: the order's Client Communications tab — append-only log, "Add client email," with attachments]`

**b) Run the revision as a new version.** Re-open the affected step (**Request revision**); the vendor delivers a **new version**; QA re-checks it; re-issue the Final Deliverable. The folders update themselves — the revised artifact lands in **`…/v2/`** and the original stays at **`v1`** (use **Sync** to refresh). Use **"+ Add Step"** only if the round genuinely needs an *extra* review pass.

**c) Billing the round — this is where the order's invoice status decides everything:**

| The delivered order is… | Where the payable/receivable go |
|---|---|
| **Not yet invoiced** (status not Paid/Invoiced) | Add the round's **vendor payable** (the step's **Purchase Order / Send PO**) and, if the client is charged, a **receivable + a supplementary invoice** — **on the same order**. The revised work stays as `v2` in the same folder. |
| **Already invoiced / Paid** | The order is financially **closed** — do **not** add charges to it. **Create a new order under the *same project* (`PRJ-…`)**, with its own PO / payable / receivable / invoice. RWS normally issues a **separate PO** for this (e.g. **DEVRF** Developer Feedback Review, **CLNFBR** Clinician Feedback Review) — onboard it per §3–10. It gets **its own order folder under the same `PRJ` folder**, so the project keeps all its rounds together. |

In-scope corrections **we** own are not charged to the client; client changes **beyond the PO scope** are quoted to RWS and the vendor paid accordingly. **Confirm chargeability (and the vendor rate) before starting paid revision work.** Use the order's **Financials** bar (Client / Vendor / Margin) and **Send PO** on the step to set the round's money; the vendor's invoice is accepted through **Vendor Invoices** as usual.

> `[SCREENSHOT 10: the order's workflow with the per-step "Send PO" + the "Financials: Client / Vendor / Margin" bar — where a round's payable and receivable are set]`
> `[SCREENSHOT 11: an already-Paid order showing the "Part of PRJ-… · N prior tasks" chip — one project carrying multiple orders/rounds]`

## 12. Audit-critical DON'Ts

- ✗ Never write **"cloned from"** or reference another order/applicant on a record (IQVIA-sensitive).
- ✗ Never claim ISO 17100 **certification** — Cethos is **aligned**, working toward Stage 2.
- ✗ Never label a validation/review step (proofreading, harmonization, etc.) an **"ISO 17100 translation service."**
- ✗ Never let the **QA reviewer be the same person** as the producer.
- ✗ Never **chain** the LV steps — each PO is its own independent single-step order.
- ✗ Never **assign an unqualified linguist** or override the eligibility gate.

## 13. Quick reference

- **RWS customer (USD, tax-exempt):** RWS Life Sciences, Inc.
- **Default QA reviewer:** Bobby Rawat (internal review).
- **Per-step recipes:** SOP-PR-003 Forward Translation · -004 Adaptation · -005 Reconciliation · -006 Back-translation · -007 BT Review · -008 Harmonization · -009 Proofreading · -010 Interview · -011 Finalization · SOP-PR-001 Cognitive Debriefing · SOP-PR-002 Clinician Review.
- **Framework:** SOP-LV-001 (the single-step + QA model, ISO conformance basis, shared procedures).

*— End of TRN-RWS-001 v0.1. Controlled .docx with embedded screenshots is stored under Staff Training in the portal Documents library (audience: staff).*
