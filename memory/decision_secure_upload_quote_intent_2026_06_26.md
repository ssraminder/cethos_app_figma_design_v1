# Decision — /secure-upload captures quote intent (2026-06-26)

**Why:** the public `/secure-upload` form (main_web `cethos-web-redesign`) collected files + an optional free-text order/quote id, but never source/target language or intended use. So `convert-submission-to-quote` produced `lead` quotes with `source_language_id = NULL`, `target_language_id = NULL`, `intended_use_id = NULL`. Proven on **ORD-2026-10527 / QT26-10687** (paid, but no language pair) — staff had to chase the customer. Target language + intended use are pure customer intent (OCR can recover source, not these).

**Design (user, 2026-06-26):** mandatory choice on the upload step —
- **New quote** → source language (optional, default "Not sure — detect from documents"), target language (required), intended use (required).
- **Existing order/quote** → order/quote number (required). Phase 1 still creates a draft quote but prepends an "EXISTING order/quote: <ref> — verify and merge" note to `customer_note` for staff. Phase 2 (later) = auto-resolve the ref and attach files to the real order.

**Shipped (both repos, Supabase `lmzoyezvsjgsxveoakdr`):**
- Migration `20260626_public_submission_quote_intent` — `public_submissions` gains `submission_type` (CHECK new_quote|existing), `source_language_id`/`target_language_id` (FK `languages`), `intended_use_id` (FK `intended_uses`), `*_name` text.
- `upload-complete` persists the fields; **new-quote validation is gated on the request actually carrying `submissionType`** so the previously-live form (which sends none) keeps working. (Lesson: when the edge fn deploys before the client that feeds it, make new required-field validation backward-compatible or you break prod — happened here, caught + regated immediately.)
- `convert-submission-to-quote` stamps `quotes.source_language_id/target_language_id/intended_use_id` from the submission.
- main_web: `SecureUploadForm.tsx` (radio + native selects; intended use grouped by `subcategory`), new `app/api/secure-upload-options` reading the **portal** `languages`/`intended_uses` (real UUIDs — NOT marketing `cethosweb_locales`).
- Admin `PublicSubmissionsPage.tsx` shows a "Request" column (type + lang pair + use).

**Verified:** backend e2e (Punjabi→English / IRCC Citizenship carried onto the converted quote) + legacy payload still succeeds; all test data + storage cleaned. Live-form Chrome verify is OTP-gated (post-deploy). Full detail in auto-memory `feature_secure_upload_quote_intent_2026_06_26`.
