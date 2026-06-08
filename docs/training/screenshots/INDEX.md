# Screenshot index — PM Workflow Training

Captured 2026-06-08 via Chrome MCP against `portal.cethos.com` / `vendor.cethos.com`.

Each entry below points at a screenshot ID from the live walkthrough conversation. When generating the PPT from this training doc, source each image from the corresponding `ss_*` ID in the session transcript.

Filenames are placeholders — the actual binaries live in the conversation transcript. Save them locally before referencing in the markdown if needed.

| File | Screenshot ID | What it shows |
|---|---|---|
| `01-order-detail-header.png` | `ss_116711bmh`, `ss_29690lb23` | ORD-2026-354733 detail page — header, Customer Information card (Dropbox Test User), Project Reference, Translation Details (Spanish → English) |
| `02-workflow-pipeline.png` | `ss_80036vwec` | Workflow section showing all 4 template steps with the new teal **`⤴ Split…`** action button on steps 1, 3, 4. Steps 0/4 progress bar, customer subtotal $65 |
| `03-split-modal-empty.png` | `ss_1205z8dhx`, `ss_29690lb23` | Split modal opened on Step 1 — header reads "Step 1 · Translation · Spanish (Spain) → English · 3 files", left pane lists 3 files, right pane shows Partition 1 (empty), validation amber "3 files not yet assigned to any partition" |
| `04-split-modal-complete.png` | `ss_9484sq6t3` | Split modal with all 3 partitions configured: P1=A King + file1, P2=Bobby Rawat IN-HOUSE + file2, P3=Adam Lengyel + file3. Validation footer green "All 3 files assigned", **`Save split (3)`** button solid teal |
| `05-workflow-pipeline-after-split.png` | `ss_0033mq3la` | Post-split rendering. Step 1: Translation now shows **"In Progress"** + teal **"⤴ Split 0/3"** badge. Three children indented under the cethos-teal left rail: `1.1 A King · 1 file · Assigned`, `1.2 Bobby Rawat · 1 file · IN-HOUSE · Assigned`, `1.3 Adam Lengyel · 1 file · Assigned`. Customer subtotal still $65, progress shows 0/7 steps |
| `06-find-vendor.png` | *NOT CAPTURED* | Vendor Finder modal — standard PM tool, not exercised in this walkthrough |
| `07-assign-vendor.png` | *NOT CAPTURED* | Standard VendorAssignModal — not exercised here |
| `08-manage-payable-modes.png` | *NOT CAPTURED* | ManagePayableModal — standard tool, not exercised in this walkthrough |
| `09-vendor-my-jobs.png` | *NOT CAPTURED* | vendor.cethos.com My Jobs view — not impersonated; behaviour documented from code |
| `10-vendor-job-detail.png` | *NOT CAPTURED* | vendor.cethos.com Job detail with `step_files` scoping — DB-verified instead (see step_files SQL evidence in the session) |
| `11-vendor-deliver.png` | *NOT CAPTURED* | vendor.cethos.com Deliver modal — not exercised |
| `12-delivery-review.png` | *NOT CAPTURED* | Admin step delivery review actions — standard tool, not exercised |
| `13-customer-invoice.png` | *NOT CAPTURED* | Customer Invoices issued view — not exercised |
| `14-vendor-create-invoice.png` | *NOT CAPTURED* | vendor.cethos.com Portal Invoices create flow — not exercised |
| `15-vendor-invoice-review.png` | *NOT CAPTURED* | Admin Vendor Invoices review — not exercised |

## Session screenshot IDs (chronological)

| ID | Context |
|---|---|
| `ss_116711bmh` | First navigate to ORD-2026-354733 — order detail header |
| `ss_10803ygfh` | Scrolled to Documents & Files (Reference + Translations sections) |
| `ss_53899bgas` | Steps 2/3/4 with original Split buttons visible (pre-split) |
| `ss_80036vwec` | Workflow section showing template overview + Step 1 with Split button |
| `ss_7743ywb5m` | First Split modal open attempt — ERROR toast "column quote_files.word_count does not exist", "No files on this order" |
| `ss_29690lb23` | Order detail header after refresh post-hotfix |
| `ss_1205z8dhx` | Split modal opened cleanly with all 3 files visible (header reads "3 files") |
| `ss_9841i3wkn` | "Add file…" dropdown showing file1/file2/file3 options |
| `ss_1049n9vtf` | P1 = test-draft-translation.png + A King vendor selected |
| `ss_2310291f9` | Partition 2 added — file dropdown empty |
| `ss_7108k0ffh` | P2 add-file dropdown showing remaining 2 files |
| `ss_12375a9f1` | P2 = file2 with In-house staff radio selected (rate fields hidden) |
| `ss_6065wiwrm` | P2 = Bobby Rawat staff selected — view scrolled |
| `ss_7796ikyt4` | Partition 3 added — single remaining file in dropdown |
| `ss_9484sq6t3` | All partitions complete — green "All 3 files assigned", Save (3) enabled |
| `ss_7995y4lja` | Toast "Split into 3 partitions" — modal closed, workflow reloading |
| `ss_6081ziqeb` | Pre-redeploy view — children showing as siblings Steps 5/6/7 instead of nested |
| `ss_0774idkry` | Post-redeploy navigate — Documents section refreshed |
| `ss_0033mq3la` | **Final rendering** — Step 1 with Split 0/3 badge + 3 indented children with IN-HOUSE pill on 1.2 |
| `ss_4873udfb1` | Admin Vendors index page (orientation, not used in doc) |
| `ss_4260a1vui` | Workflow section reloading state after final navigate |

## What to capture if extending this doc

For a fuller end-to-end PPT, drive the following extra screens (each requires real vendor / staff credentials):

1. Vendor portal **My Jobs** for A King → opens job, observes only `test-draft-translation.png` (scoping confirmed). Capture the Source files list.
2. Vendor portal **Accept** + **Deliver** for one child.
3. Admin step delivery review (Approve / Changes / Override buttons).
4. ManagePayableModal — open via the "+ Add Payable" button on a child step.
5. Customer Invoices page after invoicing.
6. Vendor Portal Invoices create flow.
7. Admin Vendor Invoices review + Mark Paid.

Each of these is documented in the training markdown but the screenshots are "to source" rather than captured today.
