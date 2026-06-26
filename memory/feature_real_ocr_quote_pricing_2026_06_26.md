# Real OCR quote pricing restored — public/customer quote flow (2026-06-26)

## What was broken
`process-quote-documents` (the edge fn the public website **/get-quote** + customer-web
flow invokes via `useDocumentProcessing` fire-and-forget) had been a **placeholder
stub** since the **2026-05-31 verify_jwt-fix CLI redeploy** dropped the real (never-
committed) inline OCR pipeline. The stub returned the SAME fabricated analysis for
**every** document — `wordCount: 350 / 1 page / detected_language "es" / birth_certificate
/ easy` — so billable_pages = ceil(350/225) = **1.56 × $65 = $101.40** (+5% GST = $106.47)
regardless of the actual document.

- Diagnosed via **QT26-10685 → ORD-2026-10524** (paid CAD $106.47): a 2-page Slovak
  **driver's licence**, 89 real words → should be **1 page × $55 = $57.75**. Customer
  overpaid ~$48.
- Scope: **89 distinct quotes** carried the stub fingerprint since 2026-06-01,
  **20 paid (~$2,836)**. Staff "Run OCR" workaround was blocked on paid quotes by the
  intentional **409 post-payment guard** in `update-quote-from-analysis` (added after the
  ORD-2026-10201 incident — correct, don't remove).
- **Second latent outage found:** `analyse-ocr-batch` hardcoded
  `claude-sonnet-4-20250514`, which Anthropic **retired (~2026-06)** → `404 not_found_error`
  failed **every** document analysis (admin "Analyze" + the pipeline), 49/49 ocr_ai_analysis
  rows failed for 7+ days.

## What shipped (1 PR, branch `fix/real-ocr-quote-pricing`)
Rewrote `process-quote-documents` as an **idempotent, re-entrant state machine** that
drives the REAL pipeline the admin "Run OCR" flow already uses:
1. **Stage A** — copy quote-files → `ocr-uploads` (flat path `${quoteId}_${fileId}.pdf`),
   call `ocr-batch-create` (no `force` → idempotent per quote), set `processing`.
2. OCR runs via the `ocr-process-next` cron. **New hook:** on quote-linked batch completion
   (`checkAndNotify`) it pings `process-quote-documents` to advance.
3. **Stage B** — triggers `analyse-ocr-batch` (service-role; sync for small docs); large/
   background sets → staff review.
4. **applyOrHold** — builds the `update-quote-from-analysis` `documents[]` payload
   (billable_pages from `ocr_ai_analysis`, `perPageRate = ceil(base_rate/2.5)*2.5`, cert 0),
   gated by **`app_settings.public_quote_auto_pricing`**:
   - **false (default, fail-closed)** → `review_required` (real analysis ready for staff;
     stops the fabricated-price bleed immediately).
   - **true** → auto-publish real price → `quote_ready` (also forces `quotes.status='quote_ready'`
     because `update-quote-from-analysis` leaves `awaiting_payment`, and Checkout.tsx only
     proceeds on `quote_ready`/`approved`).
   Terminal guard makes repeat pings no-ops; post-payment guard skips paid quotes.

Supporting changes:
- `ocr-batch-create`: accepts + persists `quoteFileId` → `ocr_batch_files.quote_file_id`
  (so `update-quote-from-analysis` maps analysis → quote_file without filename guessing).
- `analyse-ocr-batch`: allow service-role callers (Bearer == service key skips getUser);
  **model → `claude-sonnet-4-6`** (drop-in for the retired Sonnet 4 snapshot; Messages API
  call unchanged — no sampling/thinking/prefill to migrate).
- `ProcessingStatus.tsx`: `TIMEOUT_SECONDS` 45 → 75 (real OCR is slower than the instant
  stub; pipeline still finishes server-side regardless — degrades to the "we'll email you"
  screen).
- Migration `20260626_public_quote_auto_pricing.sql` (toggle default 'false').
- Client otherwise UNCHANGED — it already polls `quotes.processing_status` for
  `quote_ready`/`review_required` (ProcessingStatus.tsx / UploadContext).

## Verified (prod, test quote then torn down)
e2e on a cloned QT26-10685 Slovak-licence file: real OCR **89 words** (not 350), analysis
**sk / drivers_license / easy**, holder "Samuel Krivočenko" extracted, model
`claude-sonnet-4-6`; toggle-OFF → `review_required`; `update-quote-from-analysis` produced
**subtotal 55 / GST 2.75 / total $57.75** (vs fake $106.47). quote_file_id linkage works.
All 5 functions + migration deployed to prod (`--no-verify-jwt`). Toggle left **OFF**.

## OPEN / next
- **Customer remediation** for the 20 paid placeholder quotes (read-only list first;
  QT26-10685 = $38–48 overcharge → refund on ORD-2026-10524). Money — needs user go-ahead.
- **Flip `public_quote_auto_pricing` to 'true'** only after watching the review path on real
  prod quotes (it's the user's call; classifier blocks me flipping it without consent).
- One orphaned test object left in `ocr-uploads` (anon can't delete; harmless).
- Stage-B background (large multi-page) currently routes to staff review rather than chasing
  the async analyse-ocr-next job — fine for v1; revisit if large public quotes are common.
