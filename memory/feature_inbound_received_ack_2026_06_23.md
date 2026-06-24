# Inbound "we received your request" autoresponder (2026-06-23)

User: "vendor email triage should have an autoresponder to inform the sender that we have received their request, if it's not resolved automatically." Built it for **both** silent (no-reply, needs-a-human) paths in `cvp-inbound-email`, with a **fixed English** message (user decisions, via AskUserQuestion).

The two paths that previously sent the sender NOTHING:
1. **Applicant threaded reply → `threaded_received`** (auto-triage off, or rec=approve/reject/escalate/none, or gated by staff_attention, or blocking sentiment) → NEEDS REVIEW, silent.
2. **Active-vendor reply → `vendor_reply_captured`** (`handleVendorReply`) → team notified, vendor got nothing.

Already covered (untouched): front-desk cold-question escalation holding ack; auto-triage `acknowledge`; doc-redirect; unsubscribe. Spam/automated/own-domain stay silent (loop guard).

## What shipped (admin branch `feat/inbound-received-ack`)
- **Migration `20260623_cvp_inbound_received_ack.sql`** (MCP-applied + committed): `cvp_inbound_emails.received_ack_sent_at timestamptz` (additive, no CHECK change) + seed `cvp_system_config.inbound_received_ack = {"enabled": false}` (default OFF, fail-closed).
- **`cvp-inbound-email`:** new `maybeSendReceivedAck()` — gates: toggle (fail-closed) → `AUTOMATED_SENDER`/`OUR_DOMAINS` loop guard → applicant `do_not_contact` (vendors have no suppression flag) → **24h-per-sender dedup** (skip if same `from_email` already has `auto_reply_sent_at` OR `received_ack_sent_at` in last 24h) → `sendReply` (Brevo→Mailgun, threaded) with `buildReceivedAck`. Wired into the `threaded_received` else-arm (passes `applicationId`) and `handleVendorReply` (no applicationId). Records `received_ack_sent_at` in both inserts. `buildReceivedAck` reuses the exact front-desk holding-ack wording ("Thank you for your message — we've received it and a member of our vendor management team will get back to you shortly.").

## Key design
- **Does NOT touch `action_taken` (stays `threaded_received`/`vendor_reply_captured`) or `acknowledged_at`** — so the email still shows as NEEDS REVIEW + the amber "needs staff attention" highlight in RecruitmentDetail/the inbox. The ack reassures the *sender*; staff still must act. `received_ack_sent_at` is the separate audit + dedup signal.
- Not logged to `cvp_outbound_messages` (consistent with the other Brevo acks; keeps vm@ inbox-placement; `received_ack_sent_at` is the trace).
- Deployed `--no-verify-jwt`; health-checked (OPTIONS 200 / unsigned POST 401). **Toggle OFF in prod** — shipped dark.

## To enable + verify
Set `cvp_system_config.inbound_received_ack = {"enabled": true}`. Then a threaded applicant reply that isn't auto-resolved, or a vendor `[#VC-]` reply, should: sender gets the holding ack; `cvp_inbound_emails` row has `received_ack_sent_at` set, `action_taken` unchanged, `acknowledged_at` still NULL. A 2nd email from the same sender within 24h gets no 2nd ack. Enabling sends real emails to applicants/vendors → confirm before flipping on.

## Notes
- The front-desk holding-ack block (`runFrontDesk`) was left as-is (live path); its wording is duplicated in `buildReceivedAck` (identical). Minor: could DRY later.
- Supersedes the inbox-pivot detour; see [[feature_vendor_comm_unified_inbox_2026_06_23]].
