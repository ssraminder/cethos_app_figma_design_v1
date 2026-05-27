# Transcription System — Full Feature Handover

**Date:** 2026-05-27
**Repo:** `D:\cethos\portal\cethos_app_figma_design_v1` (admin portal)
**Supabase project:** `lmzoyezvsjgsxveoakdr`

---

## 1. Database Tables (5 tables, all `public` schema)

### `transcription_jobs` — Main job record
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| customer_email | text NOT NULL | Who ordered it |
| customer_id | uuid | FK to customers (nullable — OTP users may not have an account) |
| file_path | text | Storage path in `transcription-uploads` bucket |
| file_name | text | Original filename |
| file_duration_seconds | numeric | Audio duration |
| file_size_bytes | bigint | |
| file_format | text | mp3, wav, mp4, etc. |
| status | text | `pending` → `processing` → `completed` / `failed` / `expired` |
| provider | text | STT provider used: `openai`, `elevenlabs`, `assemblyai` |
| provider_job_id | text | External job ID |
| provider_cost | numeric | What the STT provider charged |
| source_language_id | uuid | FK to `languages` — selected or detected |
| detected_language | text | ISO 639-3 code from STT (e.g., `pan`, `hin`, `eng`) |
| language_confidence | numeric | 0–1 confidence score |
| transcript_text | text | Combined/plain transcript text |
| transcript_json | jsonb | Word-level data: `{ words: [{ text, speaker_id, start, end, type }] }` |
| word_count | integer | |
| ai_quality_score | text | A/B/C/D from `transcription-ai-check` |
| ai_quality_notes | text | Claude's quality assessment |
| pricing_tier | text | `free` or `standard` |
| amount_charged | numeric | CAD |
| currency | text | Default `CAD` |
| stripe_session_id | text | Stripe Checkout session |
| payment_status | text | `none`, `pending`, `paid` |
| human_review_requested | boolean | |
| human_review_tier | text | `standard` or `rush` |
| human_review_vendor_id | uuid | Assigned vendor |
| human_review_completed_at | timestamptz | |
| human_reviewed_text | text | Vendor's corrected transcript |
| translation_requested | boolean | |
| translation_type | text | `ai_instant` or `human` |
| translation_target_language_id | uuid | FK to `languages` |
| translated_text | text | Combined translated text |
| translation_order_id | uuid | FK to orders (human translation) |
| delivery_formats | text[] | Default `['txt']` — options: txt, docx, pdf, srt, json |
| delivered_at | timestamptz | |
| source_files | jsonb | Per-file array: `[{ name, path, size, duration, format, transcript_text, transcript_json, translated_text }]` |
| ai_total_cost | numeric | Accumulated AI spend (proofread, translate, compare, check) |
| created_at, updated_at, deleted_at | timestamptz | Soft-delete pattern |
| expires_at | timestamptz | Auto-cleanup date |

### `transcription_versions` — Version history (proofread, reprocess)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| job_id | uuid FK | → transcription_jobs |
| version_type | text | `original`, `proofread`, `reprocess` |
| provider | text | `anthropic`, `elevenlabs`, etc. |
| model | text | `haiku`, `sonnet`, `opus` |
| transcript_text | text | Full transcript for this version |
| transcript_json | jsonb | Speaker-structured word data (preserves speaker IDs + timestamps) |
| word_count | integer | |
| cost | numeric | AI cost for this version |
| is_active | boolean | Only one active per job+file_index |
| notes | text | |
| file_index | integer | Nullable — null = combined, 0-based = specific source file |
| created_at | timestamptz | |

### `transcription_audit_log` — Full audit trail
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| job_id | uuid | |
| action | text | e.g., `proofread_completed`, `translation_completed`, `ai_comparison_completed` |
| actor_type | text | `customer`, `staff`, `system`, `vendor` |
| actor_id | text | |
| details | jsonb | Action-specific metadata (model, cost, tokens, etc.) |
| created_at | timestamptz | |

### `transcription_otps` — Customer email OTP auth
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text | |
| otp_hash | text | SHA-256 of 6-digit code |
| expires_at | timestamptz | 5-minute expiry |
| verified | boolean | |
| session_token | text | HMAC-signed 24h token issued on verification |
| attempts | integer | Rate limit (max 3 per 10 min) |
| created_at | timestamptz | |

### `transcription_email_usage` — Free tier daily limit tracking
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text | |
| usage_date | date | UNIQUE(email, usage_date) |
| usage_count | integer | Incremented per free transcription |
| created_at | timestamptz | |

---

## 2. Storage

**Bucket:** `transcription-uploads` (private)

**Path structure:**
- `{job_id}/source/{filename}` — Original uploaded audio/video
- `{job_id}/output/transcript.{fmt}` — Combined output (txt, docx, pdf, srt, json)
- `{job_id}/output/file-{i+1}.{fmt}` — Per-file output for multi-file jobs

---

## 3. App Settings (`app_settings` table, `transcription_*` keys)

| Key | Current Value | Description |
|-----|---------------|-------------|
| transcription_enabled | `true` | Master toggle |
| transcription_free_tier_max_seconds | `60` | Max 1 minute per free transcription |
| transcription_free_tier_daily_limit | `5` | 5 free per email per day |
| transcription_price_per_minute | `0.15` | CAD/min for paid tier |
| transcription_human_review_price_standard | `1.25` | CAD/min standard |
| transcription_human_review_price_rush | `1.75` | CAD/min rush |
| transcription_ai_translation_price | `0.25` | CAD/min AI translation |
| transcription_free_expiry_days | `7` | Files auto-deleted after 7 days (free) |
| transcription_paid_expiry_days | `30` | Files auto-deleted after 30 days (paid) |
| transcription_primary_provider | `openai` | Default STT engine |
| transcription_fallback_provider | `openai` | When primary doesn't support the language |

---

## 4. Edge Functions (11 transcription-specific)

### Customer flow
| Function | Method | Description |
|----------|--------|-------------|
| `transcription-send-otp` | POST | Sends 6-digit OTP via Brevo email. 5-min expiry, rate-limited. |
| `transcription-verify-otp` | POST | Validates OTP, issues HMAC-signed 24h session token. |
| `transcription-upload` | POST | Multipart upload. Free tier: validates cap → auto-process. Paid tier: creates Stripe Checkout → returns URL. |
| `transcription-stripe-webhook` | POST | Stripe `checkout.session.completed` → marks paid → triggers processing. `--no-verify-jwt`. |

### Processing pipeline
| Function | Method | Description |
|----------|--------|-------------|
| `transcription-process` | POST | Downloads audio from storage, runs STT (OpenAI/ElevenLabs/AssemblyAI), stores transcript, chains to ai-check → translate → deliver. Handles multi-file ZIP uploads (processes each file, stores per-file results in `source_files` JSONB). |
| `transcription-ai-check` | POST | Claude Haiku quality scoring (A/B/C/D). ~$0.001/check. |
| `transcription-deliver` | POST | Generates TXT/DOCX/PDF/SRT/JSON outputs, uploads to storage, emails customer signed download URLs. Per-file outputs for multi-file jobs. |

### Admin AI tools
| Function | Method | Description |
|----------|--------|-------------|
| `transcription-ai-proofread` | POST | Claude proofreads transcript + translation. Script enforcement (Gurmukhi for Punjabi, Devanagari for Hindi). Cross-file context for consistent names/terms. Saves version with `transcript_json` preserving speaker structure. Supports `file_index` for per-file operation. |
| `transcription-ai-translate` | POST | Claude Sonnet translates transcript to target language. Chunks long transcripts. Supports `file_index`. |
| `transcription-ai-compare` | POST | Claude compares two transcript versions with structured diff and recommendation. Supports `file_index`. |

### Maintenance
| Function | Method | Description |
|----------|--------|-------------|
| `transcription-cleanup` | POST | Cron (daily 3 AM): deletes expired files from storage, marks jobs as expired. |

### Related (not transcription-specific)
| Function | Description |
|----------|-------------|
| `rc-auto-transcribe` | Batch-processes RingCentral call recordings: transcribe + summarize. Auto/manual modes. Separate from the transcription tool but uses similar STT providers. |

---

## 5. Shared Utilities (`_shared/transcription.ts`)

- `CORS_HEADERS` — Standard CORS with `*` origin
- `jsonResponse()` / `preflight()` — Response helpers
- `getServiceClient()` — Supabase service-role client
- `generateOtp()` / `sha256Hex()` — OTP generation + hashing
- `issueSessionToken()` / `verifySessionToken()` — HMAC-signed 24h session tokens
- `getTranscriptionSettings()` — Loads `transcription_*` from `app_settings`
- `auditLog()` — Writes to `transcription_audit_log`
- `isAssemblyAiSupported()` — Checks if a language code is in AssemblyAI's supported set
- `sendBrevoEmail()` — Sends transactional email via Brevo API

---

## 6. Frontend Pages (admin portal)

### `TranscriptionDashboard.tsx` — `/admin/transcription`
- Job list with search, filters (status, provider, pricing tier)
- Stats cards: total jobs, completed, processing, revenue
- Quick actions: upload new job (admin-initiated), process/delete
- Provider selector (OpenAI, ElevenLabs, AssemblyAI) with per-job override
- Multi-file upload support (ZIP or multiple files)

### `TranscriptionJobDetail.tsx` — `/admin/transcription/:id`
- Full job detail view with info cards (duration, language, provider, pricing)
- Language display with ISO 639-3 → human name resolver (LANGUAGE_NAMES map)
- Quality score card (AI-assessed A/B/C/D grade)
- Source files list with per-file download buttons
- **Transcript tab:** Speaker-formatted transcript from `transcript_json` (SpeakerTranscript component with speaker badges, timestamps, segments). Falls back to plain text if no JSON.
- **Translation tab:** Translated text display
- **Versions tab:** Version history list (original, proofread) with activate/preview. Each version shows type badge, provider, model, date, word count, cost. "Set Active" writes `transcript_text` + `transcript_json` back to job/source_files.
- **Audit Log tab:** Full event history from `transcription_audit_log`
- **AI Tools section:** Proofread (model selector: haiku/sonnet/opus), Translate (language picker), Compare (version A vs B picker), Reprocess
- **Downloads section:** Per-format download buttons (TXT, DOCX, PDF, SRT, JSON) with signed URL fetching

### `TranscriptionVendors.tsx` — `/admin/transcription/vendors`
- Manage human review vendors
- Assignment, completion tracking

### `TranscriptionSettings.tsx` — `/admin/settings/transcription`
- All 11 `transcription_*` settings as form controls
- Master toggle, pricing, limits, provider selection

---

## 7. Indexes

| Index | Table | Definition |
|-------|-------|------------|
| `idx_transcription_jobs_created` | jobs | `created_at DESC WHERE deleted_at IS NULL` |
| `idx_transcription_jobs_email` | jobs | `customer_email` |
| `idx_transcription_jobs_expires` | jobs | `expires_at WHERE expires_at IS NOT NULL AND status != 'expired'` |
| `idx_transcription_jobs_payment` | jobs | `payment_status WHERE payment_status = 'pending'` |
| `idx_transcription_jobs_status` | jobs | `status WHERE deleted_at IS NULL` |
| `idx_transcription_versions_job` | versions | `job_id` |
| `idx_transcription_audit_job` | audit_log | `job_id, created_at DESC` |
| `idx_transcription_email_usage_lookup` | email_usage | `email, usage_date` |
| `idx_transcription_otps_email` | otps | `email, created_at DESC` |
| `idx_transcription_otps_session` | otps | `session_token WHERE session_token IS NOT NULL` |

---

## 8. RLS Policies

| Table | Policy | Scope |
|-------|--------|-------|
| transcription_jobs | `service_role full access` | ALL |
| transcription_jobs | `staff read all` | SELECT |
| transcription_jobs | `staff insert jobs` | INSERT |
| transcription_jobs | `staff update jobs` | UPDATE |
| transcription_audit_log | `service_role full access` | ALL |
| transcription_audit_log | `staff read audit` | SELECT |
| transcription_email_usage | `service_role full access` | ALL |
| transcription_email_usage | `staff read all` | SELECT |
| transcription_otps | `service_role full access` | ALL |

---

## 9. Cron Jobs

| Name | Schedule | Target |
|------|----------|--------|
| `transcription-cleanup-daily` | `0 3 * * *` (3 AM daily) | `transcription-cleanup` |

---

## 10. Migrations (7 files)

1. `20260526_transcription_service_schema.sql` — Core tables: jobs, otps, email_usage, audit_log + indexes + RLS
2. `20260526_transcription_admin_rls.sql` — Staff RLS policies
3. `20260526_transcription_bucket_mime_types.sql` — Storage bucket + allowed MIME types
4. `20260526_transcription_source_files.sql` — Added `source_files JSONB` to jobs for multi-file support
5. `20260526_transcription_versions_and_cost.sql` — Created `transcription_versions` table + `ai_total_cost` on jobs
6. `20260527_transcription_per_file_versions.sql` — Added `file_index INTEGER` to versions for per-file versioning
7. `20260527_transcription_version_json.sql` — Added `transcript_json JSONB` to versions for speaker structure preservation

---

## 11. Key Architecture Decisions

1. **OTP-based customer auth** — No Supabase account required. Customers authenticate via email OTP, get HMAC-signed session tokens (24h TTL). Token validated in edge functions via shared `verifySessionToken()`.

2. **Multi-file support via JSONB** — Rather than a separate `transcription_files` table, per-file data lives in `source_files JSONB[]` on the job. Each entry: `{ name, path, size, duration, format, transcript_text, transcript_json, translated_text }`. Simpler for the 1–10 file range.

3. **Version system** — Every proofread/reprocess creates a new `transcription_versions` row. `file_index` scopes versions to individual source files. `is_active` marks which version is current. Activating a version writes its `transcript_text` + `transcript_json` back to the job/source_files.

4. **Speaker structure preservation** — `transcript_json` stores word-level data with `speaker_id`, `start`, `end` timestamps. The proofread function parses Claude's numbered-segment output and reconstructs `transcript_json` preserving the original speaker IDs and timestamps. Backfills original version's `transcript_json` so reverting restores the speaker view.

5. **Script enforcement** — Proofread function maps ISO 639-3 codes to script names (Gurmukhi for Punjabi, Devanagari for Hindi, etc.) and includes transliteration instructions when the STT provider may have used the wrong script.

6. **AI cost tracking** — `ai_total_cost` on the job accumulates all AI spend. Each version records its individual `cost`. Audit log entries include token counts and cost breakdown.

7. **Timeout handling** — 130s AbortController on Anthropic API calls (under 150s Supabase wall clock). `max_tokens` scaled to input size: `min(8192, max(2048, estimatedTokens * 2))`.

---

## 12. Current State & Known Issues

- **Proofread function v10 is deployed and working.** The earlier v8 had a 504 timeout (no AbortController, 16384 max_tokens). Fixed in v9/v10.
- **Gurmukhi script enforcement confirmed working.** File 5 of the 8-file Punjabi test job now produces correct Gurmukhi output.
- **Per-file accordion UI is planned but not yet built.** See plan at `~/.claude/plans/i-would-like-to-async-pond.md` — would give each source file its own expandable panel with transcript, translation, versions, AI tools, and downloads.
- **No customer-facing web UI.** Customer flow is headless: OTP auth via edge functions → upload → email with signed download URLs. Admin portal has full job management.
