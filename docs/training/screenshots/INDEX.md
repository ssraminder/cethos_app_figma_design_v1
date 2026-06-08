# Screenshot index — PM Workflow Training

Captured 2026-06-08 via Chrome MCP against `portal.cethos.com` / `vendor.cethos.com`.

Each markdown image reference in [../pm-workflow-training.md](../pm-workflow-training.md) maps to a screenshot ID from the live walkthrough session. When converting to the training PPT, source each image from the corresponding `ss_*` ID in the conversation transcript.

Filenames here are placeholders — the actual PNG/JPEG binaries live in the conversation transcript. Save them locally with these filenames before referencing in any consumer that needs disk files.

## Index — markdown reference → conversation screenshot

| Filename in markdown | Screenshot ID | What it shows |
|---|---|---|
| `01-order-detail-header.png` | `ss_116711bmh`, `ss_29690lb23` | ORD-2026-354733 order detail page — header (order number, status dropdowns), Customer Information card (Dropbox Test User), Project Reference, Translation Details (Spanish → English) |
| `02-workflow-pipeline.png` | `ss_80036vwec` | Workflow section showing the Certified Translation template with 4 steps, the new teal `⤴ Split…` action button on steps 1, 3, 4. Progress bar 0/4 steps, customer subtotal $65 |
| `03-split-modal-empty.png` | `ss_1205z8dhx` | Split modal opened on Step 1 — header reads "Step 1 · Translation · Spanish (Spain) → English · 3 files", left pane lists 3 files, right pane has one empty Partition 1, footer amber "3 files not yet assigned" |
| `04-split-modal-complete.png` | `ss_9484sq6t3` | Split modal — all 3 partitions configured: P1 = A King + test-draft-translation.png, P2 = Bobby Rawat IN-HOUSE + test-final-deliverable.png, P3 = Adam Lengyel + test-reference-file.png. Footer green "All 3 files assigned", **`Save split (3)`** button solid teal |
| `05-workflow-pipeline-after-split.png` | `ss_0033mq3la` | Post-split rendering — Step 1: Translation shows **In Progress** badge + teal **`⤴ Split 0/3`** badge. Three children indented inside the cethos-teal left rail: `1.1 A King · 1 file · Assigned`, `1.2 Bobby Rawat · 1 file · IN-HOUSE · Assigned`, `1.3 Adam Lengyel · 1 file · Assigned`. Progress shows 0/7 steps |
| `07-find-vendor.png` | `ss_8649bgcfm` | Find Vendors modal — Step 2 of ORD-2026-834732, filters bar (Source FR / Target EN / Service / Native Lang / Country / Min Rating / Max Rate / Availability), 66 vendors found ranked by Match Score, each row shows name + email + rate + availability + native langs + score + Assign/Offer buttons |
| `08-assign-vendor.png` | `ss_6796jwe5v` | Assign Vendor modal — CHRISTINA GUIDA, Profile rate $7/per page CAD, Service N/A, Pricing toggle (Rate × Units / Target no payable), Rate=7 Rate Unit=Per Page Currency=CAD with "Vendor prefers USD" warning, Page Count=1, Total=CAD $7, customer subtotal/step cost/step margin 90.7% (green), Deadline required, Instructions textarea |
| `09-offer-vendor.png` | `ss_6168uj7zf` | Offer to Vendor modal — same as Assign but with an extra **Offer expires in** dropdown defaulting to "24 hours" |
| `10-manage-payable-per-word.png` | `ss_8946thgi0` | Manage Payable modal — Step 1 Translation, Vendor: Marie Dubois, status pending. 5 mode tabs (Flat / Per word / Per hour / Per page / CAT analysis). Per word tab active showing Rate (CAD/word)=12, Words=1, Currency=CAD, Tax%=0, Subtotal=$12, Tax=$0, Total=$12. Yellow warning about replacing existing payable |
| `11-manage-payable-flat.png` | `ss_3619wwbvr` | Manage Payable — Flat tab — single Flat amount (CAD) input with placeholder "e.g. 150.00", Currency CAD, Tax % 0, Description "Step 1: Translation" placeholder |
| `12-manage-payable-cat.png` | `ss_3311i9v6x` | Manage Payable — CAT analysis tab — "Paste a Trados / SDL / memoQ / XTM / Plunet / XTRF analysis. Word counts per tier are extracted automatically; the vendor's CAT grid converts those into a payable." Base per-word rate (CAD) input, large textarea for paste, Upload file button, Parse button (disabled until base rate filled), Tip about uploading the original export file |
| `13-vendor-portal-login.png` | `ss_680330ds0` | vendor.cethos.com login page — clean Cethos logo, "Vendor Portal" subtitle, Email address input ("you@example.com" placeholder), blue Continue button, "Need access? Contact support@cethos.com" link below |
| `14-delivery-review.png` | `ss_4168seqsy` | ORD-2026-834732 Documents & Files section — Draft Translations (1) shows v1 with **Pending Review** amber pill and four action buttons: **Approve** (green), **Changes** (amber), **Remind** (slate), **Override** (teal). Completed Translations (1) shows the approved test-final-deliverable.png |
| `15-customer-invoice-list.png` | `ss_2051dhjrk` | Customer Invoices page — KPI bar (Total 1000, Drafts 0, Issued 134, Paid 853, Outstanding $25,621.83), filter row (Search, Status, Branches, Types, date range), + Create Invoice button, table of invoices with Sent/Paid status pills and Multi-order badges |
| `16-split-modal-p1-vendor.png` | `ss_1049n9vtf` | Split modal — Partition 1 configured: test-draft-translation.png chip, External vendor radio, A King selected in dropdown ("A King (amktranslate@gmail.com)"). Left pane shows test-draft-translation.png dimmed with `P1` badge |
| `17-split-modal-p2-add-file.png` | `ss_7108k0ffh` | Split modal — Partition 2 with file dropdown opened, showing remaining files test-final-deliverable.png and test-reference-file.png |
| `18-split-modal-p2-staff.png` | `ss_12375a9f1`, `ss_6065wiwrm` | Split modal — Partition 2 configured: test-final-deliverable.png, In-house staff radio selected, Bobby Rawat selected in staff dropdown, no rate fields visible (in-house has no payable) |
| `19-pre-redeploy-children-siblings.png` | `ss_6081ziqeb` | The pre-redeploy view — children rendering as top-level Steps 5/6/7 instead of nested under the parent. This shows what happens when get-order-workflow hasn't been redeployed |
| `20-adjust-payable-inline.png` | `ss_8696qr1lr` | Inline Adjust Payable form — "Current: $12.00 CAD (per_word)", New rate field (12), New total field (auto-calc or manual override, currently 12), Reason field (required) with placeholder "e.g. Scope increased — additional 2 pages", Cancel + Adjust Amount buttons |
| `21-vendor-invoices.png` | `ss_210926i2e` | Vendor Invoices page — "45 total invoices", filter row (Search, Final Date last 30 days, Filters), Summary/CSV/XLSX export buttons, table with Internal No., Invoice No., Vendor Name, Customer Name, Project(s), Branch, Status (Submitted/Confirmed blue pills), Payment (Unpaid red), Final Date |
| `22-accounts-payable.png` | `ss_6762by1kv` | Accounts Payable page — KPI bar (Total open $168,517.54 · 859 invoices, ageing buckets Current $31K / 1-30 $30K / 31-60 $29K / 61+ $77K), By vendor / By invoice toggle, vendor list with ageing columns (Usman Khan top with $150K total, $57K in 90+ bucket) |

## Complete session screenshot log (chronological)

For reference / sanity check, every screenshot taken during the live walkthrough:

| ID | Context |
|---|---|
| `ss_116711bmh` | First navigate to ORD-2026-354733 — order detail header (customer Dropbox Test User) |
| `ss_10803ygfh` | Scrolled to Documents & Files section showing Source Documents (0), Reference Files, Draft + Completed Translations |
| `ss_53899bgas` | Workflow steps 2/3/4 visible with original Split buttons (before clicking Step 1) |
| `ss_80036vwec` | Workflow section top — Certified Translation template, Step 1 Translation with Split button |
| `ss_7743ywb5m` | First Split modal open attempt — ERROR toast "column quote_files.word_count does not exist", "No files on this order" — the bug that led to hotfix PR #903 |
| `ss_29690lb23` | Order detail header after refresh post-hotfix |
| `ss_1205z8dhx` | Split modal opened cleanly — title says "3 files", left pane shows all 3 |
| `ss_9841i3wkn` | "Add file…" dropdown open showing 3 files to choose from |
| `ss_1049n9vtf` | P1 = test-draft-translation.png + A King vendor selected |
| `ss_2310291f9` | Partition 2 added — file dropdown empty (initial state) |
| `ss_7108k0ffh` | P2 add-file dropdown showing remaining 2 files |
| `ss_12375a9f1` | P2 = test-final-deliverable.png with In-house staff radio selected (rate fields hidden) |
| `ss_6065wiwrm` | P2 = Bobby Rawat staff selected, view scrolled to show "1 file not yet assigned" |
| `ss_7796ikyt4` | Partition 3 added — only test-reference-file.png remaining in dropdown |
| `ss_9484sq6t3` | All 3 partitions complete — green "All 3 files assigned", Save (3) button solid teal |
| `ss_7995y4lja` | Success toast "Split into 3 partitions" — workflow reloading |
| `ss_6081ziqeb` | Pre-redeploy view — children appearing as top-level Steps 5/6/7 (before get-order-workflow redeploy) |
| `ss_0774idkry` | Post-redeploy navigate — Documents section refreshed |
| `ss_0033mq3la` | **Final rendering** — Step 1 with Split 0/3 badge + 3 indented children with IN-HOUSE pill on 1.2 |
| `ss_4873udfb1` | Admin Vendors index page (orientation) |
| `ss_4260a1vui` | Workflow section reloading state |
| `ss_2005hgzf1` | ORD-2026-354733 Documents & Files showing Draft + Completed translations with Approve/Changes/Remind/Override buttons |
| `ss_4168seqsy` | ORD-2026-834732 — Draft Translations Pending Review + Completed Translations + delivery actions |
| `ss_13048oii9` | ORD-2026-834732 workflow Steps 2/3/4 (in-house steps with Mark Delivered button on Step 3) |
| `ss_3422oa8hf` | ORD-2026-834732 Step 1 Translation showing Marie Dubois assigned, $12/per_word, Accepted, with Adjust link |
| `ss_8696qr1lr` | Inline Adjust Payable form — Current $12 / New rate 12 / New total 12 / Reason field required |
| `ss_6231ush28` | Step 1 expanded showing all action buttons: Manage Payable (12.00 CAD), Unassign, Mark In Progress, Upload Files, Delivered by email, Promote to customer draft |
| `ss_8946thgi0` | Manage Payable modal — Per word tab active, Rate 12 Words 1 = Total $12 |
| `ss_3619wwbvr` | Manage Payable — Flat tab |
| `ss_3311i9v6x` | Manage Payable — CAT analysis tab with Base rate / paste / upload / Parse |
| `ss_8649bgcfm` | Find Vendors modal — 66 vendors ranked, Christina Guida top score 61 |
| `ss_6796jwe5v` | Assign Vendor — CHRISTINA GUIDA modal, Page Count 1, Total CAD $7, Step margin 90.7% green |
| `ss_6168uj7zf` | Offer to Vendor — same modal + Offer expires in dropdown (24 hours) |
| `ss_9216d0elh` | 404 page (wrong customer-invoices URL — corrected to /admin/invoices/customer) |
| `ss_2051dhjrk` | Customer Invoices list page — 1000 total, KPI bar |
| `ss_210926i2e` | Vendor Invoices list page — 45 total invoices, Submitted/Confirmed/Unpaid statuses |
| `ss_995344pg2` | 404 page (wrong accounts-payable URL) |
| `ss_6762by1kv` | Accounts Payable page — $168K outstanding, By vendor view |
| `ss_680330ds0` | vendor.cethos.com login page — clean OTP-only login |
| `ss_5371zzaui` | Admin vendor detail page for A King — Active/Available, 0% profile completeness, Portal: Inactive |

## What's still to capture for completeness

Future runs could add:
1. Vendor portal authenticated views (My Jobs list, Job detail with files, Accept/Decline buttons, Deliver modal) — requires either real vendor credentials or admin-impersonate-vendor against an Active vendor.
2. Step delivery upload flow (admin Upload Files modal).
3. Send All Files to Customer modal.
4. Quote → Order conversion flow.
5. New Customer creation modal.
6. Customer-portal view (via admin-impersonate-customer) showing the draft review buttons.
7. Vendor invoice creation flow on the vendor portal.
8. Bulk Payment modal.
9. AR aging detail view.
10. Brevo Email Logs modal.
11. Customer message thread.
12. Find Vendor with "Offer to Selected (N)" batch flow.
13. Vendor counter-offer modal + admin counter-back action.
14. Promote to customer draft action + customer-portal draft review.
