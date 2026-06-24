# SOP-IT-001 — Vendor-Management Inbox & AI Front Desk: Mail Infrastructure

| | |
|---|---|
| **Document ID** | SOP-IT-001 |
| **Title** | Vendor-management inbound email (`vm@cethos.com`) and AI front desk — mail infrastructure & IT configuration |
| **Owner** | IT / Systems Administrator |
| **Applies to** | Microsoft 365 (Exchange Online), Mailgun, Brevo, Supabase edge function `cvp-inbound-email` |
| **Status** | Active |
| **Last verified** | 2026-06-20 (DNS state confirmed live) |
| **Related** | SOP-OPS-001 (answering front-desk escalations), `decision_doc_collection_portal_upload`, ISO 17100 §6 (vendor onboarding traceability) |

---

## 1. Purpose

Defines the mail-routing and account configuration that makes the public vendor-management
address **`vm@cethos.com`** an AI-monitored front desk. Inbound mail to `vm@` is processed by the
Supabase edge function `cvp-inbound-email`, which auto-replies, redirects document submissions to
the portal, auto-triages applicant replies, or escalates to a human at `office@cethos.com`.

This SOP is the single source of truth for **what IT must configure and verify** so that flow keeps
working. The most common silent failure is Microsoft 365 blocking the external auto-forward — see §5.1.

## 2. Roles & responsibilities

| Role | Responsibility |
|---|---|
| IT / Systems Admin | M365 mailboxes, forwarding, mail-flow rules, outbound spam policy, DNS, Mailgun & Brevo accounts |
| Vendor-Management staff | Monitor `office@cethos.com`, answer escalations per SOP-OPS-001 |
| Engineering | Edge-function config, env vars, `cvp_system_config` toggles |

## 3. End-to-end mail flow

```
INBOUND (applicant → us)
  applicant emails  vm@cethos.com
        │  (Microsoft 365 mailbox)
        ▼
  M365 auto-forward  ──►  recruiting@vendors.cethos.com
        │  (envelope sender SRS-rewritten to …@cethoscorp.com;
        │   real sender preserved in the From: header)
        ▼
  Mailgun (EU) receives at vendors.cethos.com, inbound route fires
        ▼
  HTTPS POST (signed)  ──►  Supabase  cvp-inbound-email  webhook
        ▼
  classify → act:  auto-reply | portal-upload redirect | auto-triage |
                   ESCALATE to office@cethos.com

OUTBOUND (us → applicant)
  cvp-inbound-email sends reply
        │  primary:  Brevo, FROM vm@cethos.com  (best inbox placement)
        │  fallback: Mailgun, FROM vendors.cethos.com  (if Brevo fails)
        ▼
  Reply-To on every message = vm@cethos.com  (whole conversation lives on one address)

ESCALATION (human in the loop)
  escalation email  ──►  office@cethos.com   (FROM vm@, Reply-To vm@, subject carries [#ESC-token])
  staff hits Reply (from an @cethos.com / @vendors.cethos.com / @cethoscorp.com address)
        ▼  (reply goes to vm@ → forwarded → webhook)
  webhook sees internal sender + [#ESC-token]  → relays answer to applicant + saves draft KB entry
```

## 4. Domains & DNS (verified live 2026-06-20)

| Domain | Role | MX | SPF | DKIM | DMARC |
|---|---|---|---|---|---|
| `cethos.com` | M365 mailboxes (`vm@`, `office@`) **and** Brevo sending domain | `cethos-com.mail.protection.outlook.com` | `v=spf1 include:spf.protection.outlook.com include:spf.brevo.com ~all` ✅ both senders | M365 `selector1/2._domainkey` ✅ + Brevo `brevo1/2._domainkey` ✅ | `p=none` (monitor only) |
| `vendors.cethos.com` | Mailgun inbound engine + outbound fallback | `mxa/mxb.eu.mailgun.org` (**EU region**) | `v=spf1 include:dc-…_spfm.vendors.cethos.com ~all` (Mailgun SPF mgmt) | Verify in Mailgun dashboard (selector not `k1`/`smtp`) | none on subdomain |
| `cethoscorp.com` | Secondary M365 domain; SRS envelope-rewrite target; trusted internal sender | `cethoscorp-com.mail.protection.outlook.com` | `v=spf1 include:spf.protection.outlook.com -all` (M365 only, hard-fail) | M365 | `p=none` |

**Do not** send as `@cethoscorp.com` through Brevo or Mailgun — its SPF is M365-only with `-all`
(hard fail), so any non-M365 send will fail SPF. Outbound is always `vm@cethos.com` (Brevo) or
`vendors.cethos.com` (Mailgun fallback), both SPF-aligned.

## 5. Microsoft 365 / Exchange Online configuration

### 5.1 ⚠️ External auto-forwarding must be explicitly allowed (top failure mode)

`vm@cethos.com` forwards to `recruiting@vendors.cethos.com`, which is an **external** domain
(its MX is Mailgun, not M365). Microsoft 365's **outbound anti-spam policy blocks automatic external
forwarding by default**, and Microsoft periodically re-tightens this — it can silently break the
entire inbound pipeline.

**Configure / verify (Exchange admin or Defender portal):**
- Either set the outbound spam filter policy's **Automatic forwarding** to **"On – Forwarding is enabled"**, OR
- Create a **mail-flow (transport) rule** exception that permits forwarding from `vm@cethos.com` to `recruiting@vendors.cethos.com`.
- PowerShell check:
  ```powershell
  Get-HostedOutboundSpamFilterPolicy | Select-Object Name, AutoForwardingMode
  # AutoForwardingMode must be "On" (or "Automatic" if a rule grants the exception)
  ```

### 5.2 The `vm@cethos.com` mailbox

- Should be a **shared mailbox** (no license cost). Confirm it exists and is **not** hidden in a way
  that blocks delivery.
- Forwarding method: **`Set-Mailbox vm@cethos.com -ForwardingAddress recruiting@vendors.cethos.com -DeliverToMailboxAndForward $true`**.
  - `DeliverToMailboxAndForward $true` keeps a **copy in `vm@`** for audit/ISO retention while still
    forwarding to Mailgun. (A pure "redirect" leaves no copy — avoid.)
- Confirm the **From: header is preserved** through the forward. SRS rewrites the *envelope* sender to
  `…@cethoscorp.com` (expected, and handled in code — the webhook reads `From:` not the envelope).
  Do **not** switch to a client-side "Fwd:" rule — that makes the forwarder the sender and breaks
  reply routing.
- PowerShell check:
  ```powershell
  Get-Mailbox vm@cethos.com | Select-Object ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward
  ```

### 5.3 The `office@cethos.com` mailbox (human escalation target)

- Must be a **monitored** shared mailbox or distribution group. AI escalations land here.
- Staff who answer **must reply from an internal address** (`@cethos.com`, `@vendors.cethos.com`, or
  `@cethoscorp.com`) — the webhook only triggers QA-relay + knowledge-base capture for senders on
  those domains (`INTERNAL_SENDER` allow-list). A reply from a personal Gmail will **not** be relayed.
- The **`[#ESC-xxxxxxxx]` token must stay in the subject line.** Most clients keep it on "Reply"; do
  not let a rule or signature tool strip bracketed tokens.
- See SOP-OPS-001 for the staff-facing procedure.

### 5.4 Loop / auto-reply safety (already handled in code, do not undo)

The webhook drops mail from `no-reply@`, `mailer-daemon@`, `postmaster@`, `bounce@`, etc., and from
our own domains (`cethos.com`, `vendors.cethos.com`). Do **not** configure an Exchange auto-reply
(OOF) or a server auto-acknowledgement on `vm@` — replies are generated by the webhook, and a second
auto-responder would risk a mail loop.

## 6. Mailgun configuration

- **Region: EU** (MX = `*.eu.mailgun.org`). All Mailgun API/route config must use the **EU base URL**
  (`api.eu.mailgun.net`), not the US default.
- **Inbound route:** mail to `recruiting@vendors.cethos.com` (the catch / matching route) → **forward
  (store + notify) to the webhook URL** `https://<project>.supabase.co/functions/v1/cvp-inbound-email`.
- **Signing key:** the webhook verifies an HMAC-SHA256 signature; the Mailgun **HTTP webhook signing
  key** must equal the Supabase secret `MAILGUN_WEBHOOK_SIGNING_KEY`. If rotated in Mailgun, update
  the Supabase secret in the same change or every inbound returns `401 Invalid signature`.
- Verify DKIM/SPF for `vendors.cethos.com` show **green/verified** in the Mailgun domain dashboard.

## 7. Brevo configuration

- **`vm@cethos.com` must remain a verified sender** (or `cethos.com` a verified/authenticated domain)
  in Brevo. If it lapses, the primary transport fails and replies fall back to Mailgun
  (`vendors.cethos.com`), which historically lands in **Promotions/Spam** instead of the inbox.
- Brevo DKIM (`brevo1/2._domainkey.cethos.com`) and the SPF `include:spf.brevo.com` are present —
  keep them.
- API key lives in Supabase secret `BREVO_API_KEY`.

## 8. Supabase edge-function configuration

**Secrets (Project `lmzoyezvsjgsxveoakdr`):** `MAILGUN_WEBHOOK_SIGNING_KEY`, `BREVO_API_KEY`,
`ANTHROPIC_API_KEY`, `CVP_SUPPORT_EMAIL` (default `vm@cethos.com`), `SUPABASE_SERVICE_ROLE_KEY`.

**Feature toggles (`cvp_system_config` table):**

| Key | Purpose | Default | Current |
|---|---|---|---|
| `inbound_frontdesk` | AI front desk for cold email; `{enabled, escalation_email}` | OFF | **ON**, escalation_email `office@cethos.com` |
| `inbound_auto_triage` | Auto-act on safe/reversible reply recommendations | OFF (fail-closed) | per env |
| `inbound_doc_redirect` | Redirect emailed documents to portal upload | ON (fail-open) | ON |

Deploy the function with `--no-verify-jwt` (Mailgun posts unauthenticated; the function does its own
signature check).

## 9. Verification procedure (run after any change in §5–8)

1. **Health:** `OPTIONS` to the webhook URL returns `200`; an unsigned `POST` returns `401`.
2. **Inbound reaches the webhook:** from an external account, email `vm@cethos.com`. Confirm a new row
   in `cvp_inbound_emails` within ~1 min. If none → the M365 forward or Mailgun route is broken (§5.1, §6).
3. **Cold CV/interest:** send "Here is my CV, how do I apply?" → expect an auto-reply with an
   **Apply** button (`action_taken = frontdesk_replied`).
4. **Question:** send a genuine question → expect (a) a holding ack to the sender and (b) an
   escalation in `office@cethos.com` with `[#ESC-…]` in the subject (`frontdesk_escalated`).
5. **Staff reply:** from an `@cethos.com` address, reply to that escalation keeping the token →
   expect the answer relayed to the original sender from `vm@` and a `draft` row in `cvp_kb_entries`
   (`action_taken = qa_relayed`).
6. **Document email:** reply to one of our emails with a PDF attached → expect the portal-upload
   redirect (`upload_redirect_sent`).
7. **Deliverability:** confirm the auto-reply lands in **Inbox**, not Spam/Promotions (sent via Brevo
   from `vm@`). If it landed via Mailgun fallback, check Brevo sender verification (§7). Diagnose
   Mailgun placement with the `get-mailgun-email-events` probe.

## 10. Troubleshooting runbook

| Symptom | Likely cause | Fix |
|---|---|---|
| No `cvp_inbound_emails` rows for new mail to `vm@` | M365 external auto-forward blocked, or Mailgun route down | §5.1 outbound spam policy; check Mailgun route + EU region |
| All inbound logs `401 Invalid signature` | Mailgun signing key ≠ Supabase secret | Re-sync `MAILGUN_WEBHOOK_SIGNING_KEY` (§6) |
| Replies land in Spam/Promotions | Sent via Mailgun fallback; Brevo sender unverified | Re-verify `vm@`/`cethos.com` in Brevo (§7) |
| Reply goes to the wrong address | Client "Fwd:" rule instead of mailbox forward (From not preserved) | Use `Set-Mailbox -ForwardingAddress` (§5.2) |
| Staff answer never reaches applicant; no KB draft | Staff replied from a non-internal domain, or token stripped from subject | Reply from `@cethos.com`; keep `[#ESC-…]` (§5.3, SOP-OPS-001) |
| Wrong sender matched on a forwarded mail | Reading envelope instead of `From:` | Already fixed in code (prefers `From:`); do not regress |

## 11. Change log

| Date | Change |
|---|---|
| 2026-06-20 | Initial SOP. Front desk enabled in prod; replies unified to send from `vm@cethos.com` via Brevo; SRS From-over-envelope fix; Phase 2a QA knowledge base live. DNS state verified. |
