# SOP-028 — Post-Delivery Client Review & Revision Rounds

| | |
|---|---|
| **Document ID** | SOP-028 |
| **Title** | Handling client review/changes after delivery — revision rounds, billing, and folders |
| **Owner** | Project Management / Operations |
| **Applies to** | Any PM whose delivered order is returned by the client with review/changes (all workflows) |
| **Status** | Draft v0.2 (2026-06-26) — adds the *already-invoiced → new order under the same project* rule |
| **Governing policy** | SOP-001 (Document Control & Records), SOP-007 (CAPA & complaint handling), the per-workflow production SOPs (SOP-022…025, SOP-PR-001…011) |
| **Standard** | ISO 17100:2015 — §5.2 (project management & client communication); §5.3.3 (revision) / §5.3.6 (verification & release) applied to the revised work; §6.1 (feedback); §6.2 (records, ≥5 yr) |

---

## 1. Purpose & principle

A job is delivered; days (or weeks) later the client returns with a review and change requests. This SOP says **how to run that as a controlled revision round** — keeping the pipeline, the billing, and the project folders auditable.

**The principle:** *a post-delivery change is not a quiet re-send. It is a new revision round on the order — the client's feedback is a §6.1 record, the revised work is re-verified (§5.3.6), and the new version of every affected artifact is retained alongside the original.* What passed QA the first time and what passed it after the client's review must both be provable.

---

## 2. When this applies + the scope decision

This applies once an order is **delivered** (workflow `completed`, final deliverable sent) and the client comes back with feedback/changes.

**First decision — same order, or a new order under the same project?** It turns on **two** things: is this a correction of what we delivered, and **is the order already invoiced?**

| The change is… | …and the order is… | Action |
|---|---|---|
| Correcting / refining the **delivered scope** (typos, terminology, a few lines, formatting, reviewer comments on the same instrument) | **not yet invoiced** | **Revision round on the SAME order** (§3–5; bill on the same order per §4). |
| Correcting / refining the **delivered scope** | **already invoiced / Paid** | **New order under the SAME project** — the original is financially closed (§4). Run §3–5 on the new order. |
| **Genuinely new / expanded work** (new documents, languages, sections beyond scope) | either | **New order under the SAME project** (own quote / PO / billing). |

A new order always sits **under the same internal project (`PRJ-…`)**, so the project keeps all its rounds together and the folders nest under the same `PRJ` folder. When in doubt: *am I revising what we delivered, or producing something new — and is the original already invoiced?*

---

## 3. The process (revision round on the same order)

1. **Log the client's return (§6.1 — do this first).** Open the order → **Client Communications** → **+ Add client email**. Set the **email date to the client's actual send time** (back-date it), a clear subject (e.g. *"Round 2 — terminology corrections, p.3–5"*), the body = the client's request, and **attach the client's markup / feedback files**. Save. *Do not overwrite a previous round — each round is a new entry.*
2. **(Optional) regenerate the vendor brief.** If the order uses AI vendor-instructions, regenerate from the new communication and **approve** it before the vendor sees it.
3. **Re-open the affected step(s).** On the relevant production step, use **Request revision** (with the reason). This flips the step from `approved` back to `revision_requested`, increments its `revision_count`, and returns the workflow to `in_progress`. Re-open only the steps that actually need redoing.
4. **Vendor revises → new version.** The vendor delivers the corrected file. This is a **new `step_deliveries` version (v2, v3…)** — it does **not** overwrite v1.
5. **Re-run internal QA (§5.3.6).** QA reviews the revised version against the client's feedback; record the sign-off. For ISO-17100 translation workflows, the §5.3.3 reviser checks the revision where the change is substantive.
6. **Re-issue the deliverable.** Mark the new delivery final and **Send to client** again. The re-send is logged.
7. **Confirm + close the round.** Confirm receipt; log any further feedback as the next round. Route complaints to CAPA (SOP-007).

---

## 4. Billing the round

**Where the money goes depends on whether the original order is already invoiced:**

- **Not yet invoiced → bill on the SAME order.** Add the round's **vendor payable** (re-assign the step / **Send PO**) and, if chargeable, a **new receivable line + a supplementary `customer_invoice`** (linked to the original via `reference_invoice_id`). The revised work stays as `v2` in the same order folder. An order supports **multiple payables, receivables, and invoices**, so the round bills cleanly without a new order.
- **Already invoiced / Paid → create a NEW order under the SAME project.** The invoiced order is financially **closed** — do **not** add charges to it. Raise a new order under the same `PRJ-…` (own PO / payable / receivable / invoice), and run §3–5 there. It gets its **own order folder under the same project folder**, keeping the project's rounds together.
- **The vendor's invoice** for the round is **accepted through the normal vendor-invoice flow** in either path.

**Chargeability:** in-scope fixes **we** own → no client charge (still record the round); client-requested changes **beyond scope** → quote/charge the client and pay the vendor accordingly. **Confirm chargeability *and* the vendor rate before starting paid revision work.** Use the order's **Financials** bar (Client / Vendor / Margin) + **Send PO** on the step to set the round's money.

---

## 5. Folders (team Dropbox)

The revision round is fully represented in the order's folder — no manual filing:

```
{ORD} - {Service} - {pair} - {date}/
├── 00_Admin/                     PROJECT-RECORD.md (records the round count + sign-offs)
├── 01_Source/v1/                 (v2/ only if the client sends new/updated source)
├── 05_Client-Review/
│   ├── round-1/   feedback.md + the client's markup attachments
│   └── round-2/   feedback.md + markup …                         ← one folder per client review
├── 10_{Step}/v1/  v2/  v3/       ← each revision round re-versions the affected step
├── 20_QA-Review/v1/  v2/         ← the QA-approved copy of each version
└── 30_Final-Deliverable/v1/  v2/ ← each version that was sent to the client
```

- **`05_Client-Review/round-N/`** is generated from the **Client Communications** entry: `feedback.md` (subject, date, body) + the attached markup files. So *logging the feedback in the portal is what populates the folder* — do step 3.1 properly.
- **`v2`, `v3`** appear automatically when the vendor delivers a new version and you re-sync the order. v1 is never overwritten.
- The result: an auditor opening the order sees the original deliverable (v1), the client's feedback (round-N), and the revised, re-QA'd, re-delivered version (v2) — the complete chain.

---

## 6. Records & ISO traceability (§6.2, ≥5 yr)

Each round leaves: the **client communication** (§6.1, back-dated, with attachments) → `05_Client-Review/round-N/`; the **revision request** (step `revision_count`, reason); the **revised delivery** (`step_deliveries` v2) → step folder `…/v2/`; the **QA re-sign-off** (approved-at + reviewer) → `PROJECT-RECORD.md`; the **re-send** record; and any **payable / receivable / invoice** for the round. All retained ≥5 years.

---

## 7. Don't

- **Don't re-send a corrected file without a logged round.** A silent re-delivery has no §6.1 record and no version trail.
- **Don't overwrite v1.** Revisions are new versions; the original deliverable must remain.
- **Don't start paid revision work before confirming chargeability** with the client (and the vendor rate).
- **Don't put genuinely new/expanded work on the old order** — raise a new linked order.
- **Don't skip the re-QA.** A client-driven change still passes internal verification before it ships.

---

## 8. Related documents

- **SOP-022…025, SOP-PR-001…011** — the per-workflow production SOPs (the round re-runs their steps).
- **SOP-007** — CAPA & complaint handling (when feedback is a complaint).
- **SOP-001** — Document Control & Records.
- **Folder system** — the team-Dropbox per-workflow structure (`dropbox-team-sync`): `05_Client-Review/round-N/` + `v{n}` step versions implement this SOP automatically.
