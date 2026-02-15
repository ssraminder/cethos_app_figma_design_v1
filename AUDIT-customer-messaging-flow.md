# Customer Messaging Flow — End-to-End Audit

**Date:** 2026-02-15
**Scope:** Read-only audit of customer messaging flow, edge functions, auth, RLS, and table references
**Status:** PARTIALLY WORKING / UNVERIFIABLE — 4 critical edge functions have no source in repo

---

## 1. Edge Function: `send-customer-message`

**STATUS: DOES NOT EXIST IN THIS REPO**

The `supabase/functions/` directory contains only 6 functions:
- `process-inbound-email`
- `process-quote-documents`
- `send-customer-login-otp`
- `send-email`
- `send-staff-message`
- `verify-customer-login-otp`

Called from:
- `client/pages/customer/CustomerQuoteDetail.tsx:159` — sends `{ customer_id, quote_id, message_text }`
- `client/components/messaging/MessageComposer.tsx:146` — sends `{ customer_id, quote_id?, message_text, attachments? }`

Cannot verify: table used, INSERT statement, email notification, service_role vs anon key.

---

## 2. Edge Function: `get-customer-messages`

**STATUS: DOES NOT EXIST AND IS NOT REFERENCED**

No file exists. Zero client code references. Not called anywhere.

---

## 3. Edge Function: `get-quote-messages`

**STATUS: DOES NOT EXIST IN THIS REPO**

Called from:
- `client/pages/customer/CustomerQuoteDetail.tsx:132` — POST with `{ quote_id }`
- `client/pages/customer/CustomerMessages.tsx:52,121` — GET with `?customer_id=`
- `client/components/messaging/MessagePanel.tsx:79` — POST with `{ quote_id }`
- `client/components/admin/MessageCustomerModal.tsx:175` — POST

Called with two patterns: POST with `quote_id` (per-quote) and GET with `customer_id` (all messages).

---

## 4. Additional Missing Edge Functions

- **`mark-messages-read`** — Called from `CustomerMessages.tsx:78,137` and `MessagePanel.tsx:42`. No source in repo.
- **`upload-message-attachment`** — Called from `MessageComposer.tsx:86`. No source in repo.

---

## 5. CustomerQuoteDetail.tsx Messaging Logic

**File:** `client/pages/customer/CustomerQuoteDetail.tsx`

- **FETCH:** Calls `get-quote-messages` (POST, line 131-151) with `{ quote_id }`. Auth: anon key.
- **SEND:** Calls `send-customer-message` (POST, line 157-183) with `{ customer_id, quote_id, message_text }`. Auth: anon key.
- **Identity:** `customer?.id` in request body. Anon key in Authorization header.
- **Realtime:** NONE. No realtime subscription. Manual re-fetch after sending only.
- **Table references:** No direct references to `conversation_messages` or `quote_messages`.

---

## 6. CustomerMessages.tsx (Dedicated Page)

**File:** `client/pages/customer/CustomerMessages.tsx`

- **FETCH:** Calls `get-quote-messages?customer_id={id}` (GET, line 51-59). Returns ALL messages, not filtered by quote.
- **SEND:** Via `MessageComposer` component → `send-customer-message`.
- **Mark-as-read:** Calls `mark-messages-read` (POST) with `{ conversation_id, reader_type: "customer", reader_id }`.
- **Display:** Single flat thread (all messages, not grouped by quote).
- **Realtime subscription (line 160-177):**
  - Table: `conversation_messages`
  - Filter: `conversation_id=eq.${conversation.id}`
  - Event: INSERT
  - Polling fallback: every 10 seconds

---

## 7. Shared Components

| Component | Table/Function References | Direct Supabase Queries |
|-----------|--------------------------|------------------------|
| `MessageThread.tsx` | None — pure UI | None |
| `MessageComposer.tsx` | `send-customer-message`, `upload-message-attachment` | None |
| `MessageBubble.tsx` | None — pure UI | None |
| `MessagePanel.tsx` | `get-quote-messages`, `send-staff-message`, `mark-messages-read`, `conversation_messages` (realtime) | `quotes`, `customer_conversations` |
| `FileAttachment.tsx` | None | `supabase.storage.from("message-attachments").createSignedUrl()` |

**Zero references to `quote_messages` in any component.**

---

## 8. Auth Header / Session Token Passing

**Every edge function call from customer pages uses the Supabase anon key:**

```
Authorization: Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}
```

Customer identity is passed as a body parameter (`customer_id`) or query parameter (`?customer_id=`).

The `CustomerAuthContext` stores a custom session token (`cethos_customer_session` in localStorage) but **this token is never sent** to any edge function.

**Security issue:** Anyone with the public anon key can impersonate any customer by providing a different `customer_id`.

---

## 9. RLS Compatibility

- **Direct queries from customer pages:** None to `conversation_messages`. Customer pages use edge functions exclusively. ✅
- **Edge function auth:** Only verifiable function (`send-staff-message`) uses `SUPABASE_SERVICE_ROLE_KEY` → bypasses RLS. ✅
- **Missing functions:** Cannot verify if they use service_role or anon key. ⚠️
- **Realtime subscriptions:** Uses anon-key client. If RLS is on `conversation_messages`, subscriptions will silently fail. Mitigated by 10-second polling. ⚠️
- **Storage:** `FileAttachment.tsx` calls `createSignedUrl()` with anon key. May fail if bucket policy requires `auth.uid()`. ⚠️

---

## 10. Table Reference Audit

### `quote_messages` (old table)
**Zero occurrences** in `client/pages/customer/` or `client/components/messaging/`. Clean. ✅

### `conversation_messages`
| File | Line | Context |
|------|------|---------|
| `client/pages/customer/CustomerMessages.tsx` | 167 | Realtime subscription |
| `client/components/messaging/MessagePanel.tsx` | 196 | Realtime subscription |

### `customer_conversations`
| File | Line | Context |
|------|------|---------|
| `client/components/messaging/MessagePanel.tsx` | 149 | Direct query (admin side) |
| `client/components/admin/NotificationProvider.tsx` | 77 | Direct query (admin) |
| `client/pages/admin/AdminQuoteDetail.tsx` | 990 | Direct query (admin) |

---

## 11. Summary

### Will customer messaging work as-is? **UNKNOWN / PARTIALLY**

The 4 critical edge functions are not in this repository. If they are deployed to Supabase externally and use service_role keys, messaging may work. Cannot verify from codebase alone.

### Blockers

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | 4 edge functions missing from repo | CRITICAL | `send-customer-message`, `get-quote-messages`, `mark-messages-read`, `upload-message-attachment` |
| 2 | No customer auth verification | HIGH (Security) | Anon key + unverified `customer_id` param = anyone can impersonate any customer |
| 3 | Realtime likely fails for customers | MEDIUM | Anon key can't pass RLS on `conversation_messages`. 10s polling mitigates. |
| 4 | Storage signed URLs may fail | MEDIUM | `FileAttachment.tsx` uses anon key for `createSignedUrl()` |
| 5 | No realtime on CustomerQuoteDetail | LOW | No live updates on quote detail page; manual refresh only |
| 6 | Customer session token unused | HIGH (Security) | `CustomerAuthContext` has a token but it's never passed to edge functions |
