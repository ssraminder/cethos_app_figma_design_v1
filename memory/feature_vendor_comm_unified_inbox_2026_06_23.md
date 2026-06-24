# Vendor Communication → unified inbound inbox (2026-06-23)

User: "/admin/vendors/communication is not updating — does it match the actual messages received?" Investigation (live DB + edge logs): the **page wasn't broken** — `manage-vendor-communication` `inbox` returns HTTP 200 every call. The `inbox` action just filtered to `matched_vendor_id IS NOT NULL` inbound + `vendor_id IS NOT NULL` outbound, i.e. **only `[#VC-<token>]` threads staff start from the page**. Only one such thread existed (a self-test to/from ss.raminder@gmail.com), so the page correctly showed 2 messages — while **856 inbound/7d** (all already in `cvp_inbound_emails`) were filtered out. The user's own 23:59 "Testing" email was classified `other` → `frontdesk_dropped` (no `[#VC-]` tag) → invisible.

**This reverses the earlier descope** in [[feature_recruitment_message_applicant_2026_06_23]] ("ignore the vendor inbox messages"). User now wants the page to be a **complete inbox of ALL messages received**, irrespective of vendor status, **even from unregistered senders**. There is NO "match inbound by sender email → vendor" path in `cvp-inbound-email`; the inbox now reads the raw `cvp_inbound_emails` log instead of relying on a match.

## What shipped (admin repo, branch `feat/vendor-comm-unified-inbox`)
- **`manage-vendor-communication` (edge), `inbox` action:** now returns **all inbound** from `cvp_inbound_emails` (last 30 days, `order by received_at desc`, cap 200) + vendor-comm outbound (`vendor_id`, cap 80). Batch-resolves vendor names (matched_vendor_id) + applicant names (matched_application_id → cvp_applications) and falls back to from_name/from_email for unregistered. Each row carries routing fields `{ vendorId, applicationId, senderType: vendor|applicant|other, name, email, intent, action, unread }`. New **`message` action** `{ inboundId }` returns one inbound email's full body for the read-only viewer. `list`/`preview`/`send` untouched. Deployed `--no-verify-jwt` (still does its own `requireStaff`).
- **`AdminVendorCommunication.tsx`:** renamed header to "Inbox"; renders every row with sender + a type badge (Vendor/Applicant/Other); **filter chips** (All/Vendors/Applicants/Other) client-side; click routing — vendor → in-page `VendorCommunicationTab`; applicant → `navigate(/admin/recruitment/:id)`; other → **read-only modal** (fetches `message` action). Keeps 2-min auto-refresh + manual Refresh + "New message" search. Refresh failure now shows an amber "couldn't refresh" hint instead of total silence.

## Data
- **No migration.** All inbound was already logged in `cvp_inbound_emails` (timestamp col is `received_at`, NOT `created_at`; no `created_at` exists). Reading the log surfaces dropped/applicant/stranger mail automatically.
- **Backfill (one-time, MCP):** linked **19** last-2-day inbound rows to a vendor — `matched_vendor_id` set where sender email matched a `vendors` row AND `matched_application_id IS NULL` (applicant rows keep routing to recruitment; UI prioritizes applicationId). Only affects click-through, not display.

## Notes / open
- Recruitment outbound is intentionally **excluded** from this inbox (huge volume of test/reminder mail) — only vendor-comm outbound shows. Easy to add if wanted.
- The page is now broader than "Vendor Communication"; route unchanged (`/admin/vendors/communication`). Consider renaming the nav label + route later.
- `tsc` is globally dirty (pre-existing); confirmed **0** new errors in the edited files.
- Parked: the "we received your request" autoresponder for silent triage paths (threaded_received + vendor_reply_captured) — planned, not built.
- Verify live on portal.cethos.com after deploy: open the page → all recent inbound listed newest-first incl. the 23:59 test; click vendor/applicant/other rows route correctly; filter chips work.
