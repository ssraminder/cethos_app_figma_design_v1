# CETHOS Messaging System Audit

**Date:** 2026-02-14
**Scope:** Full audit of messaging tables, edge functions, and frontend components

---

## Section 1: Current Architecture

### Which system is active?

**The New System (Phase 7c) is the active system.** All frontend code exclusively reads from and writes to `conversation_messages` and `customer_conversations`. There is zero frontend code that references the old `quote_messages` table.

However, the old `quote_messages` table is referenced in planning documentation (`DATABASE_SCHEMA_REVIEW_FOR_HITL_PANEL.md`) as if it still exists in the database. It's unclear whether the table was dropped, renamed, or simply abandoned in favor of the new system.

### Data Flow: Staff Sends Message

```
Staff clicks "Send Message" / "Message Customer" in AdminQuoteDetail
  → Opens MessageCustomerModal
  → POST to edge function: send-staff-message
     Payload: { customer_id, quote_id, message_text, staff_id, attachments? }
  → Edge function (not in local codebase) inserts into conversation_messages
  → Realtime subscription on conversation_messages triggers UI refresh
  → Message appears in modal thread
```

Additionally, the "Request Revision" action in AdminQuoteDetail (line 1505-1519) also calls `send-staff-message` with:
```json
{ "quote_id": id, "staff_id": currentStaff.staffId, "message_text": "We need a clearer scan..." }
```

### Data Flow: Customer Replies via Email

```
Customer replies to notification email
  → Mailgun/Brevo inbound webhook
  → POST to edge function: process-inbound-email (NOT in local codebase)
  → Edge function inserts into conversation_messages with source='email'
  → quote_id is likely NULL (email reply has no quote context)
  → Realtime subscription triggers UI refresh for staff
  → NotificationProvider shows toast + browser notification + sound
```

### Data Flow: Customer Sends via App

```
Customer on /dashboard/messages page
  → Types message in MessageComposer
  → POST to edge function: send-customer-message
     Payload: { customer_id, quote_id? (optional from props), message_text, attachments? }
  → Edge function inserts into conversation_messages
  → Realtime triggers staff notification
```

---

## Section 2: Table Schemas

### 2A. Tables Referenced in Frontend Code

The frontend code queries/subscribes to these tables:

| Table | Used In Frontend | How |
|---|---|---|
| `conversation_messages` | Yes - everywhere | Direct Supabase queries + realtime subscriptions |
| `customer_conversations` | Yes - lookups | Get conversation ID from customer ID |
| `quote_messages` | **No** | Zero references in any .tsx/.ts file |
| `message_attachments` | Indirectly | Via `message-attachments` storage bucket |

### 2B. `conversation_messages` — Columns Used in Frontend

Based on the Supabase query in `AdminQuoteDetail.tsx` (lines 674-696), the following columns are selected:

| Column | Used | Notes |
|---|---|---|
| `id` | Yes | Primary key |
| `conversation_id` | Yes | FK to customer_conversations, used for realtime filter |
| `quote_id` | Yes | Used in `.eq("quote_id", id)` filter in AdminQuoteDetail |
| `order_id` | Yes | Selected in query, appears in MessageBubble metadata |
| `sender_type` | Yes | 'staff', 'customer', or 'system' |
| `sender_customer_id` | Yes | FK join to customers for name |
| `sender_staff_id` | Yes | FK join to staff_users for name |
| `message_type` | Yes | For system message cards (quote_created, payment_received, etc.) |
| `message_text` | Yes | Message body |
| `read_by_customer_at` | Yes | Timestamp, used for read receipts |
| `read_by_staff_at` | Yes | Timestamp, used for unread badge |
| `source` | Yes | 'app' or 'email' — shown as "via Email" badge |
| `created_at` | Yes | Timestamp for ordering and display |

Foreign key relationships used in the query:
- `staff_users!conversation_messages_sender_staff_id_fkey(full_name)`
- `customers!conversation_messages_sender_customer_id_fkey(full_name)`

### 2C. `customer_conversations` — Columns Used in Frontend

| Column | Used In | How |
|---|---|---|
| `id` | MessagePanel, NotificationProvider | Conversation ID for subscriptions |
| `customer_id` | MessagePanel | `.eq("customer_id", ...)` lookup |
| `unread_count_customer` | CustomerMessages | Displayed as badge (from interface, may not be populated) |
| `unread_count_staff` | CustomerMessages | From interface definition |
| `last_message_at` | CustomerMessages | From interface definition |
| `created_at` | CustomerMessages | From interface definition |
| `customers(full_name, email)` | NotificationProvider | FK join for notification display |

### 2D. Row Counts

**Cannot be determined from local codebase.** No database access was performed. SQL queries from the task description would need to be run against the live Supabase instance.

### 2E. `quote_messages` Table

Referenced only in `DATABASE_SCHEMA_REVIEW_FOR_HITL_PANEL.md` (a planning document). The documentation lists these columns:
- `sender_type` ('customer' or 'staff')
- `sender_staff_id`, `sender_customer_id`
- `message_text`
- `attachments` (JSONB)
- `created_at`
- `read_at`
- `system_message_type`
- `is_internal` (for internal staff notes)

**No frontend code reads from or writes to `quote_messages`.** It appears this table was planned for the HITL panel but the new `conversation_messages` system superseded it.

### 2F. Missing Local Artifacts

- **No SQL migration files** define the messaging tables (checked all 6 .sql files in the repo)
- **No edge function source code** exists for any messaging functions (only 4 edge functions exist locally: `send-email`, `send-customer-login-otp`, `verify-customer-login-otp`, `process-quote-documents`)

---

## Section 3: Quote/Order Linking — Current State

### Does `conversation_messages` have a `quote_id` column?

**Yes.** The AdminQuoteDetail.tsx query (line 680) explicitly selects `quote_id` and filters by it (line 695): `.eq("quote_id", id)`.

### Is `quote_id` populated?

**Partially.** Based on code analysis:

| Scenario | `quote_id` Set? | Evidence |
|---|---|---|
| Staff sends from AdminQuoteDetail via MessageCustomerModal | **Yes** — `quote_id: quoteId` or `quote_id: quoteId \|\| null` | `MessageCustomerModal.tsx` line 280 |
| Staff sends from AdminQuoteDetail via "Request Revision" | **Yes** — `quote_id: id` | `AdminQuoteDetail.tsx` line 1514 |
| Staff sends from MessagePanel | **Yes** — `quote_id: quoteId` | `MessagePanel.tsx` line 235 |
| Customer sends from `/dashboard/messages` | **No** — `quoteId` prop is not passed to MessageComposer | `CustomerMessages.tsx` line 257-262 |
| Customer replies via email | **No** — email replies have no quote context | By design (process-inbound-email) |

### Does `conversation_messages` have an `order_id` column?

**Yes.** It is selected in the AdminQuoteDetail query (line 681). The MessageBubble component also renders order number badges from `message.metadata?.order_number` (line 92-103).

### Is `order_id` populated?

**Unknown from code alone.** No frontend code currently sets `order_id` when sending messages. It may be set by edge functions or database triggers. The AdminOrderDetail page has no messaging integration — it only has a link to `/dashboard/messages`.

### When customer replies via email, is quote/order context preserved?

**No.** Email replies go through `process-inbound-email` which likely creates messages with `quote_id: NULL` and `order_id: NULL`. This is the known issue from the Phase 7c handover.

---

## Section 4: Gaps for Customer Panel Messaging

### View A: Profile-Level Messages (`/dashboard/messages`)

**Current implementation:** `CustomerMessages.tsx` exists and is functional.

**What works today:**
- Fetches ALL messages for a customer via `get-quote-messages?customer_id={id}` (GET request)
- Displays messages in a single thread using MessageThread + MessageBubble
- Real-time updates via Supabase realtime subscription on `conversation_messages`
- Polling fallback every 10 seconds
- Read receipts (read_by_staff_at / read_by_customer_at)
- Customer can send messages via MessageComposer → `send-customer-message`
- Auto-marks messages as read via `mark-messages-read`
- System message cards (quote_created, payment_received, etc.)
- File attachment upload and download

**What's missing:**
1. **No quote/order grouping** — All messages appear in one flat thread. There's no way to see which messages relate to which quote/order.
2. **No per-quote/order filtering** — The `get-quote-messages` edge function when called with just `customer_id` returns ALL messages, not grouped by quote.
3. **No quote/order number display per message row** — MessageBubble does support `metadata.quote_number` and `metadata.order_number` badges, but it's unclear if these are populated on messages. The data may need to come from joining quote_id/order_id to the quotes/orders tables.
4. **No conversation list** — Currently shows one flat conversation. For customers with multiple quotes/orders, there's no way to navigate between contexts.
5. **No unread count per quote/order** — Only a global unread count exists.
6. **`quoteId` is not passed** when customer sends a message from this page (MessageComposer has no `quoteId` prop set in CustomerMessages.tsx line 257-262), so new customer messages from this page have `quote_id: NULL`.

### View B: Quote/Order-Level Messages (`/dashboard/quotes/:id` or `/dashboard/orders/:id`)

**Current implementation:** Does NOT exist.

- `CustomerQuoteDetail.tsx` — **No messaging references at all.** Zero imports or mentions of messages, conversations, or messaging components.
- `CustomerOrderDetail.tsx` — Has a "Message Staff" button (line 301-305) but it just **navigates to `/dashboard/messages`**. It does not display messages inline or filter by order.

**What's available today to build this:**
- `conversation_messages.quote_id` column exists and is populated for staff-sent messages from AdminQuoteDetail
- MessageThread and MessageBubble components are reusable
- MessageComposer is reusable and accepts optional `quoteId` prop
- `get-quote-messages` edge function accepts `quote_id` parameter (used by MessagePanel and MessageCustomerModal)

**What's missing:**
1. **No message display** on CustomerQuoteDetail or CustomerOrderDetail pages
2. **No quote-filtered fetch** from the customer side — CustomerMessages fetches by customer_id only
3. **Customer-sent messages lack quote_id** — When sent from `/dashboard/messages`, no quote context is attached
4. **Email replies lack quote_id** — No way to retroactively tag them
5. **No `order_id` is set** by any frontend code when sending messages
6. **No way for staff to manually tag** an "unlinked" message to a specific quote/order after the fact

---

## Section 5: Recommendations

### Option A: Add `quote_id` and `order_id` columns to `conversation_messages`

**These columns already exist.** The AdminQuoteDetail query selects both `quote_id` (line 680) and `order_id` (line 681). No migration needed for column creation.

**Pros:**
- Columns are already there — just need to ensure they're consistently populated
- Single table for all messages — simpler queries and realtime subscriptions
- AdminQuoteDetail already filters by `quote_id` successfully

**Cons:**
- Email replies and customer-initiated messages still won't have quote/order context
- Requires edge function updates to consistently set quote_id/order_id

**Changes needed:**
- Update `send-customer-message` edge function to accept and save `quote_id`/`order_id`
- Pass `quoteId` prop to MessageComposer in CustomerMessages when viewing from a quote context
- Add message display to CustomerQuoteDetail and CustomerOrderDetail pages
- Consider adding metadata fields (quote_number, order_number) for display without joins

### Option B: Keep `quote_messages` for quote-level + `conversation_messages` for general

**Not recommended.** The `quote_messages` table is not used by any frontend code and appears to be a vestige of the original design (referenced only in planning docs). Maintaining two systems would double the complexity for no benefit.

**Pros:**
- Clean separation of concerns (per-quote vs general)

**Cons:**
- Two tables to query, two sets of RLS policies, two realtime subscriptions
- Staff would need to check two places for messages
- No frontend code uses `quote_messages` today — would require building from scratch
- Email replies would still need to go somewhere (which table?)
- Notification system only watches `conversation_messages`

### Option C: Unified approach — always use `conversation_messages` with optional `quote_id`/`order_id` (RECOMMENDED)

This is essentially a refinement of Option A, since the columns already exist. The key changes are about ensuring they're **consistently populated** and handling the "unlinked" message problem.

**Approach:**

1. **Always set `quote_id`/`order_id` when context is available:**
   - Staff sends from AdminQuoteDetail → set `quote_id` (already works)
   - Staff sends from AdminOrderDetail → set `order_id` (needs implementation)
   - Customer sends from quote detail page → set `quote_id` (needs new UI)
   - Customer sends from order detail page → set `order_id` (needs new UI)

2. **Handle email replies (no quote context):**
   - Email replies get `quote_id: NULL`, `order_id: NULL`
   - Display in customer's profile-level message view under an "General" or "Unlinked" section
   - Staff can optionally **tag** an unlinked message to a quote/order via admin UI (new feature: small dropdown on unlinked messages)

3. **Customer Panel Views:**
   - `/dashboard/messages` — Shows all messages, grouped by quote/order context. Unlinked messages in a separate "General" section.
   - `/dashboard/quotes/:id` — Shows filtered messages where `quote_id = :id` plus a "Send Message" composer that auto-tags with the quote_id.
   - `/dashboard/orders/:id` — Same pattern with `order_id`.

4. **Edge function changes needed:**
   - `send-customer-message`: Accept and persist `quote_id` and `order_id` params
   - `send-staff-message`: Ensure `order_id` is accepted (not just `quote_id`)
   - `get-quote-messages`: Support filtering by `order_id` in addition to `quote_id`; optionally return quote_number/order_number via joins
   - Consider a new `tag-message` edge function for staff to retroactively link messages

5. **Handling unlinked messages in customer views:**
   - Profile-level view: Show all messages. For each message, display a badge if it has a quote_number or order_number (from metadata or join).
   - Messages without quote/order context appear without a badge — they're still part of the conversation thread.
   - This is a natural UX: the conversation is continuous, but some messages have quote/order tags.

**Pros:**
- Single source of truth for all messages
- Columns already exist — minimal database changes
- Realtime and notification system already work with this table
- Progressive enhancement: start with flat thread, add filtering later
- Email replies gracefully degrade to "untagged" messages

**Cons:**
- Some messages will always lack quote/order context (email replies)
- Requires frontend work to add messaging to CustomerQuoteDetail/CustomerOrderDetail
- Staff manual tagging feature adds some complexity

---

## Section 6: Component Inventory

### Messaging Components (`client/components/messaging/`)

| Component | Purpose | Used By |
|---|---|---|
| `MessagePanel.tsx` | Inline staff message panel (embedded) | **NOT IMPORTED ANYWHERE** — unused component |
| `MessageBubble.tsx` | Individual message bubble with read receipts | MessageThread, MessageCustomerModal (inline) |
| `MessageThread.tsx` | Grouped message thread with date separators | CustomerMessages |
| `MessageComposer.tsx` | Customer-facing message composer with attachments | CustomerMessages |
| `SystemMessageCard.tsx` | System event cards (quote_created, payment, etc.) | MessageBubble (for system type) |
| `FileAttachment.tsx` | File attachment display with signed URL download | MessageBubble (for attachments) |
| `DateSeparator.tsx` | Date divider between message groups | MessageThread |

### Admin Components

| Component | Purpose | Used By |
|---|---|---|
| `MessageCustomerModal.tsx` | Modal for staff to message customers | AdminQuoteDetail |
| `NotificationProvider.tsx` | Global realtime notification for new customer messages | Admin layout wrapper |

### Pages with Messaging

| Page | Messaging Feature | Details |
|---|---|---|
| `AdminQuoteDetail.tsx` | Inline message display + Send via modal | Reads `conversation_messages` filtered by `quote_id`; opens MessageCustomerModal; also sends via `send-staff-message` for revision requests |
| `CustomerMessages.tsx` | Full message thread + composer | Reads all messages for customer via `get-quote-messages`; sends via `send-customer-message` |
| `CustomerOrderDetail.tsx` | Link only | "Message Staff" button navigates to `/dashboard/messages` |
| `CustomerQuoteDetail.tsx` | **None** | No messaging references |

---

## Section 7: Edge Function Status

### Functions Referenced in Frontend (NOT in local codebase)

| Edge Function | Referenced By | HTTP Method | Params | Status |
|---|---|---|---|---|
| `send-staff-message` | MessagePanel, MessageCustomerModal, AdminQuoteDetail | POST | `{ quote_id, staff_id, message_text, customer_id?, attachments? }` | **Source not local** — deployed directly to Supabase |
| `get-quote-messages` | MessagePanel, MessageCustomerModal, CustomerMessages | POST (staff) / GET (customer) | `{ quote_id?, customer_id? }` or `?customer_id=` | **Source not local** |
| `send-customer-message` | MessageComposer | POST | `{ customer_id, staff_id?, quote_id?, message_text, attachments? }` | **Source not local** |
| `mark-messages-read` | MessagePanel, CustomerMessages | POST | `{ conversation_id, reader_type, reader_id }` | **Source not local** |
| `upload-message-attachment` | MessageComposer, MessageCustomerModal | POST (multipart) | `file, conversation_id, uploader_type, uploader_id` | **Source not local** |
| `process-inbound-email` | Not referenced in frontend | N/A | Inbound webhook | **Source not local** |

### Functions Present Locally (NOT messaging-related)

| Edge Function | Purpose |
|---|---|
| `send-email` | Generic Brevo transactional email |
| `send-customer-login-otp` | OTP generation and delivery |
| `verify-customer-login-otp` | OTP validation |
| `process-quote-documents` | Document processing pipeline |

**Key Risk:** All 6 messaging edge functions exist only on the deployed Supabase instance. There is no local source code, no version control for these functions, and no way to audit their exact behavior without accessing the Supabase dashboard or function logs.

---

## Section 8: Summary of Findings

### What's Working
- Staff can send messages from AdminQuoteDetail (via modal) with `quote_id` attached
- Customers can view and send messages from `/dashboard/messages`
- Real-time message delivery via Supabase postgres_changes
- Read receipts (read_by_customer_at / read_by_staff_at)
- File attachment upload and download
- Admin notification system (toast + browser notifications + sound)
- System message cards for lifecycle events

### What's Not Working / Missing
1. **MessagePanel component is unused** — exists but never imported
2. **No messaging on CustomerQuoteDetail** — customer can't message from quote context
3. **No messaging on CustomerOrderDetail** — only a redirect link
4. **Customer-sent messages lack `quote_id`** — sent without context from `/dashboard/messages`
5. **Email replies lack `quote_id`/`order_id`** — by design, but creates "orphan" messages
6. **No `order_id` is set** by any frontend code
7. **No message grouping** by quote/order in customer view
8. **Edge function source code not version-controlled** — only deployed copies exist
9. **`quote_messages` table status unknown** — may or may not still exist in database
10. **No staff ability to tag** unlinked messages to quotes/orders

### Recommended Next Steps (Priority Order)
1. **Verify database state** — Run the SQL queries from the task description against the live Supabase instance to confirm table existence, column schemas, row counts, and RLS policies
2. **Version-control edge functions** — Pull deployed edge function source into the local `supabase/functions/` directory
3. **Implement Option C** — Unified conversation_messages with consistent quote_id/order_id tagging
4. **Add messaging to CustomerQuoteDetail** — Inline message thread + composer with auto-tagged quote_id
5. **Add messaging to CustomerOrderDetail** — Same pattern with order_id
6. **Update CustomerMessages** — Group messages by quote/order context
7. **Decide on `quote_messages` table** — If it still exists, either migrate its data to `conversation_messages` or drop it
