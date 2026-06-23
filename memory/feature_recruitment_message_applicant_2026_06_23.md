# Recruitment: "Message applicant" — initiate a fresh email (2026-06-23)

User on the recruitment detail page (Ana Rona, APP-26-8983): "there is no option to send
a message to the applicant." Correct — the page already had a **Conversation** timeline +
a **StaffReplyModal**, but the only send path was the **Reply** button on an *inbound*
message (`StaffReplyModal` required `inboundEmailId`), and the whole Conversation section
only rendered when `conversation.length > 0`. So a fresh applicant who never emailed in
could not be contacted from the portal at all.

Same session the user ALSO asked to turn the standalone Vendor Communication page into an
auto-refreshing inbox (all vendor threads, no vendor-select-first) — then **explicitly
descoped it** ("ignore the vendor inbox messages"). Only the recruitment change shipped.
The vendor-inbox idea (add an `inbox` action to `manage-vendor-communication` + rebuild
`AdminVendorCommunication.tsx` as a thread list w/ 2-min poll) is still open if revisited.

## What shipped
- **`cvp-staff-reply` (edge):** `inboundEmailId` is now **optional**. Present → threaded
  reply (unchanged). Absent → **fresh message** to the applicant: recipient = `app.email`,
  default subject "A message regarding your Cethos application", new `STAFF_MESSAGE_SYSTEM_PROMPT`
  for the AI draft (cold message, not a reply), **no** In-Reply-To/References, no inbound to
  acknowledge, `templateTag = "staff-message"`. Outbound is logged + threaded automatically
  because `sendMailgunEmail`'s `trackContext` inserts into `cvp_outbound_messages`
  (application_id + message_id); the applicant's reply threads back via cvp-inbound-email's
  In-Reply-To → outbound message_id match. Backward compatible; deployed `--no-verify-jwt`
  (OPTIONS 200 / unauth POST 401 verified).
- **`RecruitmentDetail.tsx`:** Conversation section now **always renders** (gated on `id`),
  with a **"Message applicant"** button (teal, `Mail` icon) that opens `StaffReplyModal` in
  compose mode (`composeNew` state, `inboundEmailId={null}`). Empty state when no messages.
  `StaffReplyModal` generalized: `inboundEmailId?: string | null`; `isReply` toggles title
  ("Reply to applicant" vs "Message applicant"), send-button label, placeholder, default
  subject; payloads spread `...threadRef` so `inboundEmailId` is only sent in reply mode.

## Notes
- No DB migration. Reuses existing `cvp_outbound_messages` / `cvp_inbound_emails` threading
  (scoped by application_id / matched_application_id), same tables the Vendor Communication
  feature reuses by vendor_id.
- `tsc` is globally dirty in this repo (pre-existing Supabase nested-relation typing noise);
  confirmed **0** new errors in RecruitmentDetail.tsx.
- PR: see commit. Live-verify on portal.cethos.com after deploy: open any recruitment
  applicant → Conversation → "Message applicant" → AI draft → preview → send from vm@.
