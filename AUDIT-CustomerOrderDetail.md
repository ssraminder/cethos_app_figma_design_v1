# CustomerOrderDetail.tsx — Full Audit Report

**Date:** 2026-02-16
**File:** `client/pages/customer/CustomerOrderDetail.tsx` (775 lines)
**Status:** Investigation only — no changes made

---

## Issue 1: Missing Order Details (Languages, Intended Use)

### Step 1A: What order data is fetched

The `loadOrder` function (lines 182–212) calls the edge function `get-customer-order-detail`:

```
GET /functions/v1/get-customer-order-detail?order_id={id}&customer_id={customerId}
```

**Critical finding:** This edge function **does not exist** in the local repository (`supabase/functions/`). It is presumably deployed on Supabase but its source is not version-controlled. The only 8 edge functions in the repo are:
- `generate-invoice-pdf`
- `process-inbound-email`
- `process-quote-documents`
- `review-draft-file`
- `send-customer-login-otp`
- `send-email`
- `send-staff-message`
- `verify-customer-login-otp`

The TypeScript `Order` interface (lines 16–26) defines only these fields:
- `id`, `order_number`, `status`, `total_amount`, `tax_amount`, `created_at`, `updated_at`, `quote_id`, `estimated_completion_date`

**No language fields. No intended use. No quote join data.**

### Step 1B: Order detail display section

The order info/summary is rendered in two cards:

1. **Header card** (lines 418–505): Shows `order_number`, `created_at` date, `estimated_completion_date`, status badge, and the status timeline.
2. **Order Summary card** (lines 508–534): Shows only financial info — subtotal, tax, total.

**Fields currently displayed:**
- Order number (line 422)
- Order date (line 427)
- Estimated completion date (line 433)
- Status badge (line 441)
- Status timeline (lines 451–504)
- Subtotal (line 516)
- Tax (line 521)
- Total (line 530)

**No reference to language or intended use anywhere in the file.** Zero grep hits for `source_language`, `target_language`, or `intended_use` in CustomerOrderDetail.tsx.

### Step 1C: Quote data alongside order

The `Order` interface includes `quote_id` (line 24) but **no quote data is fetched separately**. There is no secondary query to the `quotes` table and no join data from the edge function (since its source isn't available to verify).

**Comparison with admin side:** `AdminOrderDetail.tsx` fetches quote data via a Supabase join:
```typescript
// AdminOrderDetail.tsx line 649-650
source_language:languages!source_language_id(id, code, name),
target_language:languages!target_language_id(id, code, name)
```
And displays them at lines 1390–1410.

The customer quote detail page (`CustomerQuoteDetail.tsx`) also displays `source_language` and `target_language` (lines 28–29, 510–521).

**Languages live in:** `quotes` table as `source_language_id` and `target_language_id` (FK to `languages` table). See `client/lib/supabase.ts` lines 91–92.

### Step 1D: Intended use field

`intended_use_id` is stored on the `quotes` table (see `client/lib/supabase.ts` line 93 and `client/hooks/useSupabase.ts` line 162). It is referenced in:
- `client/components/quote/Step2Details.tsx`
- `client/components/quote/Step4Delivery.tsx`
- `client/components/quote/Step4ReviewCheckout.tsx`
- `client/pages/admin/settings/IntendedUsesSettings.tsx`

**It is completely absent from `CustomerOrderDetail.tsx`.**

### Issue 1 Finding

| Field | Available in DB? | Displayed on Customer Order Page? |
|-------|-----------------|----------------------------------|
| Source Language | Yes (`quotes.source_language_id`) | **NO** |
| Target Language | Yes (`quotes.target_language_id`) | **NO** |
| Intended Use | Yes (`quotes.intended_use_id`) | **NO** |
| Country of Issue | Yes (`quotes.country_of_issue`) | **NO** |

**Fix needed:** The `get-customer-order-detail` edge function (source not in repo) needs to join against the `quotes` table and return language/intended use data. The `Order` interface and render section in `CustomerOrderDetail.tsx` must be updated to display these fields.

---

## Issue 2: Messaging Component

### Step 2A: "Message Staff" button

Located at lines 696–702:
```tsx
<Link
  to="/dashboard/messages"
  className="flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
>
  <MessageSquare className="w-5 h-5" />
  Message Staff
</Link>
```

- **Button text:** "Message Staff"
- **Behavior:** Navigates to `/dashboard/messages` (a separate page). It is a `<Link>`, not a modal or inline component.
- **Always visible:** No conditional rendering — the button shows for every order status.
- **No order context passed:** The link goes to the general messages page without any `order_id` or `quote_id` parameter.

### Step 2B: The messages page and composer

The `/dashboard/messages` route renders `CustomerMessages.tsx`, which uses:

1. **`MessageThread`** component (`client/components/messaging/MessageThread.tsx`) — displays chat bubble history
2. **`MessageComposer`** component (`client/components/messaging/MessageComposer.tsx`) — textarea + send button + file attachments

The `MessageComposer` props interface (lines 4–12) accepts:
- `conversationId`, `customerId`, `staffId`, `quoteId`
- **No `orderId` parameter exists.**

When sending, it calls `send-customer-message` edge function (line 146) with payload:
```json
{
  "customer_id": "...",
  "quote_id": "...",    // optional
  "message_text": "...",
  "attachments": [...]  // optional
}
```

**No `order_id` is ever passed.**

### Step 2C: `send-customer-message` edge function

**CRITICAL: This edge function does NOT exist in the repository.**

It is called from `MessageComposer.tsx` line 146 and `CustomerMessages.tsx` (indirectly), but no source file exists in `supabase/functions/`. Presumably deployed on Supabase but not version-controlled.

Based on the pattern of the existing `send-staff-message` edge function, we can infer what it should do:
1. Accept customer message payload
2. Create/get conversation in `customer_conversations`
3. Insert message in `conversation_messages` with `sender_type: "customer"`
4. Process attachments
5. **Send email notification to staff?** — Unknown. The `send-staff-message` function DOES send email to the customer via Brevo. Whether the inverse (`send-customer-message` notifying staff) does the same **cannot be verified** without the source.

### Step 2D: Customer messaging files

Files with messaging functionality in the customer portal:
- `client/pages/customer/CustomerMessages.tsx` — full messages page
- `client/pages/customer/CustomerQuoteDetail.tsx` — has inline messaging for quotes
- `client/components/messaging/MessageComposer.tsx` — shared composer component
- `client/components/messaging/MessageThread.tsx` — shared thread display
- `client/components/messaging/FileAttachment.tsx` — attachment display

### Issue 2 Finding

| Aspect | Current State |
|--------|--------------|
| Button text | "Message Staff" |
| Button location | Lines 696–702, always visible |
| Behavior | Navigates to `/dashboard/messages` (separate page) |
| Order context passed? | **NO** — no `order_id` in link or composer |
| Inline messaging? | **NO** — not embedded in order page |
| `send-customer-message` source in repo? | **NO** — missing from `supabase/functions/` |
| Staff notification on customer message | **UNKNOWN** — cannot verify without source |

**Fix needed:**
1. Source code for `send-customer-message` should be added to the repo.
2. The "Message Staff" link should ideally pass `order_id` context (e.g., `/dashboard/messages?order_id=xxx`) so messages are tagged to the order.
3. The `MessageComposer` interface should accept an `orderId` prop, and the edge function should store it on `conversation_messages`.

---

## Issue 3: Staff File Upload — No Customer Notification

### Step 3A: Staff file upload flow

Staff uploads files from `AdminOrderDetail.tsx` using two mechanisms:

1. **`upload-staff-quote-file` edge function** (called at line 422–431) — handles file storage and record creation. **Source is NOT in the repo** (same missing-source issue).

2. **`OrderUploadModal`** (`client/components/admin/OrderUploadModal.tsx`) — a simpler upload that writes directly to Supabase storage + `quote_files` table (lines 74–88). **No notification logic at all.**

### Step 3B: What happens after upload

When staff uploads a **draft** via `AdminOrderDetail.tsx`:
1. File is uploaded via `upload-staff-quote-file` (line 422)
2. File category is set to `draft_translation` (line 398)
3. `review-draft-file` edge function is called with `action: "submit_for_review"` (lines 468–484)
4. Inside `review-draft-file` (line 131–140), the `submit_for_review` action **DOES send an email notification** to the customer via `notifyCustomerDraftReady()` (Brevo API, lines 453–529)

When staff uploads a **final deliverable** via `AdminOrderDetail.tsx`:
- Upload happens, but the `deliver_final` action on `review-draft-file` must be triggered separately. When it is, `notifyCustomerDelivery()` sends an email (lines 633–711).

When staff uploads **other files** (reference, etc.):
- **NO notification is sent.** The file is uploaded and that's it.

### Step 3C: Database triggers

**No database triggers exist** for notifying customers on `quote_files` insert. The only trigger in the migration is `trg_customer_invoices_updated_at` which just updates timestamps.

### Issue 3 Finding

| Upload Type | Customer Notified? | Mechanism |
|-------------|-------------------|-----------|
| Draft translation | **YES** | `review-draft-file` → `notifyCustomerDraftReady()` via Brevo |
| Final deliverable | **YES** | `review-draft-file` → `notifyCustomerDelivery()` via Brevo |
| Reference/other files | **NO** | No notification mechanism exists |
| Via `OrderUploadModal` (generic) | **NO** | Direct Supabase insert, no notification |

**Fix needed:** If staff uploads non-draft files that the customer should know about, a notification mechanism is needed. For drafts and finals, the current flow via `review-draft-file` already handles notifications correctly.

---

## Issue 4: Status Display — "invoiced" vs "completed"

### Step 4A: The `invoiced` status in CustomerOrderDetail

The `STATUS_TIMELINE` (lines 28–34) contains:
```
paid → in_production → draft_review → delivered → completed
```

The `STATUS_COLORS` map (lines 36–43) contains:
```
paid, in_production, draft_review, delivered, completed, cancelled
```

**`invoiced` is absent from both.**

Consequences when `order.status === "invoiced"`:
1. **Status badge** (line 441–447): Falls through to `|| "bg-gray-100 text-gray-800"` for color, and displays raw `"invoiced"` since `STATUS_TIMELINE.find()` returns undefined.
2. **Timeline** (line 347): `findIndex` returns `-1`, so `currentStatusIndex = -1`. This means:
   - Progress bar width = `(-1 / 4) * 100 = -25%` (renders as 0%)
   - No steps highlighted as completed
3. **Invoice button** (line 685): The condition is `["draft_review", "delivered", "completed"].includes(order.status)` — `"invoiced"` is NOT included, so **the Download Invoice button is hidden** for invoiced orders.

### Step 4B: How `invoiced` status is set

In `review-draft-file/index.ts` line 367–368:
```typescript
const newOrderStatus = order.balance_due <= 0 ? "invoiced" : "delivered";
```

This runs during the `deliver_final` action. When `balance_due <= 0` (i.e., fully prepaid), the order goes straight to `invoiced` instead of `delivered`.

There is **no automatic `invoiced` → `completed` transition.** The admin side (`AdminOrderDetail.tsx` line 152) includes `invoiced` as a valid status option, but the transition appears to be manual.

### Step 4C: `invoiced` in the admin side

The admin side fully recognizes `invoiced`:
- `AdminOrdersList.tsx` line 44: `{ value: "invoiced", label: "Invoiced" }`
- `AdminOrdersList.tsx` line 580: `invoiced: "bg-purple-100 text-purple-700"`
- `AdminOrderDetail.tsx` line 152: `{ value: "invoiced", label: "Invoiced", color: "purple" }`

### Issue 4 Finding

| Aspect | Current State | Problem |
|--------|--------------|---------|
| `invoiced` in STATUS_TIMELINE | **Missing** | Timeline shows no progress |
| `invoiced` in STATUS_COLORS | **Missing** | Falls through to default gray |
| Badge label for `invoiced` | Shows raw "invoiced" | Should show "Invoiced" |
| Invoice button for `invoiced` | **Hidden** | Condition doesn't include "invoiced" |
| `invoiced` → `completed` transition | **Manual only** | No auto-transition |

**Fix needed (Option A — Quick fix, recommended):**
1. Add `invoiced` to `STATUS_COLORS`: `invoiced: "bg-purple-100 text-purple-800"`
2. Add `invoiced` to `STATUS_TIMELINE` between `delivered` and `completed`, OR map it to `delivered` step
3. Add `"invoiced"` to the invoice button condition: `["draft_review", "delivered", "completed", "invoiced"].includes(order.status)`

---

## Issue 5: Full Component Structure Report

### Step 5A: All action buttons (lines 684–703)

| Button | Text | Line | Condition | Behavior |
|--------|------|------|-----------|----------|
| Download Invoice | "Download Invoice" | 686–694 | `status in [draft_review, delivered, completed]` | Calls `generate-invoice-pdf` edge function, opens in new window |
| Message Staff | "Message Staff" | 696–702 | Always visible (no condition) | Navigates to `/dashboard/messages` |

**No other action buttons exist** (no "Track Delivery", no "Leave Review", etc.)

### Step 5B: Page sections (top to bottom)

| # | Section | Lines | Description |
|---|---------|-------|-------------|
| 1 | Back button | 409–415 | `<Link to="/dashboard/orders">` with ArrowLeft icon |
| 2 | Header card | 418–505 | Contains order number, dates, status badge, and timeline |
| 2a | — Order number | 421–423 | `<h1>` with `order.order_number` |
| 2b | — Dates row | 424–438 | Created date + estimated completion date |
| 2c | — Status badge | 440–448 | Pill badge with color from STATUS_COLORS |
| 2d | — Status timeline | 451–504 | 5-step progress bar (paid → completed) |
| 3 | Order Summary card | 508–534 | Subtotal, tax, total amounts only |
| 4 | Files header | 537 | "Files & Translations" heading |
| 5 | Drafts for Review | 544–630 | Draft files with Approve/Request Changes buttons (conditional on `pending_review`) |
| 6 | Source Documents | 633 | FileSection: "Your Uploaded Documents" |
| 7 | Staff Files | 636–638 | FileSection: "Staff Files" (conditional on count > 0) |
| 8 | Completed Translations | 642–679 | Final deliverables with download links |
| 9 | Actions grid | 684–703 | Download Invoice + Message Staff buttons |
| 10 | Approve Draft Modal | 707–733 | Confirmation dialog for draft approval |
| 11 | Request Changes Modal | 736–771 | Textarea dialog for change requests |

**Notable absences:**
- No language pair display
- No intended use / certification type display
- No country of issue display
- No special instructions
- No link back to the original quote
- No inline messaging
- No delivery tracking

---

## Summary Table

| Issue | Finding | Current State | Fix Needed |
|-------|---------|---------------|------------|
| Languages displayed | `source_language`, `target_language` not fetched or shown | **MISSING** | Add quote join to edge function + display in Order Summary |
| Intended use displayed | `intended_use_id` not fetched or shown | **MISSING** | Add to edge function response + display |
| Message button text | "Message Staff" | OK | Consider adding order context to link |
| Message component type | `<Link>` navigation to `/dashboard/messages` | Basic but functional | Consider inline messaging or passing `order_id` param |
| Staff notification on customer msg | `send-customer-message` source not in repo; cannot verify | **UNKNOWN** | Add source to repo; verify/add staff email notification |
| Customer notification on file upload | Drafts: YES (via `review-draft-file`). Other files: NO | **PARTIAL** | Add notification for non-draft uploads if needed |
| "invoiced" status handling | Not in `STATUS_TIMELINE` or `STATUS_COLORS` | **BROKEN** — shows raw text, timeline empty | Add `invoiced` to STATUS_COLORS, timeline, and badge label map |
| Invoice button for "invoiced" | Condition excludes "invoiced" | **HIDDEN** when it should be shown | Add `"invoiced"` to the includes array on line 685 |

---

## Additional Findings

### Missing Edge Function Sources

The following edge functions are called from client code but **do not have source in the repo**:

| Function | Called From | Status |
|----------|-----------|--------|
| `get-customer-order-detail` | `CustomerOrderDetail.tsx:188` | **NOT IN REPO** |
| `send-customer-message` | `MessageComposer.tsx:146` | **NOT IN REPO** |
| `get-quote-messages` | `CustomerMessages.tsx:52` | **NOT IN REPO** |
| `mark-messages-read` | `CustomerMessages.tsx:78` | **NOT IN REPO** |
| `upload-message-attachment` | `MessageComposer.tsx:86` | **NOT IN REPO** |
| `upload-staff-quote-file` | `AdminOrderDetail.tsx:423` | **NOT IN REPO** |
| `get-customer-documents` | `CustomerOrderDetail.tsx:218` | **NOT IN REPO** |

This makes it impossible to audit the full data flow for several issues. These deployed functions should be pulled into version control.

### `review-draft-file` Notification Summary

This is the one fully-auditable edge function that handles notifications:

| Action | Who is notified | Email sent? |
|--------|----------------|-------------|
| `submit_for_review` | Customer | YES — `notifyCustomerDraftReady()` |
| `approve` | Staff | YES — `notifyStaffDraftApproved()` |
| `request_changes` | Staff | YES — `notifyStaffChangesRequested()` |
| `deliver_final` | Customer | YES — `notifyCustomerDelivery()` |

All use Brevo API directly (no Supabase email triggers).
