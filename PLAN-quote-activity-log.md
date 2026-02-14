# Plan: Add Quote Activity Log

## Current State

### What the Admin Quote Detail page displays (AdminQuoteDetail.tsx)
- Customer info, documents with AI analysis, pricing breakdown, HITL review, messaging
- **Timeline section** (lines 3424-3455): Only shows 3 static timestamps:
  - Created (`created_at`)
  - Last Updated (`updated_at`)
  - Expires (`expires_at`)
- **Payment Info** (lines 3458+): Shows payment method, confirmed date, confirmed by

### Tables currently read by the quote detail page
| Table | Purpose |
|-------|---------|
| `quotes` | Main quote record |
| `quote_files` | Uploaded documents |
| `quote_pages` | Pages extracted from files |
| `ai_analysis_results` | AI extraction results |
| `customers` | Customer info |
| `languages` | Source/target languages |
| `certification_types` | Certifications |
| `tax_rates` | Tax rates |
| `quote_document_groups` | Document groupings |
| `quote_page_group_assignments` | Page-to-group mapping |
| `quote_adjustments` | Discounts/surcharges |
| `quote_certifications` | Quote certifications |
| `hitl_reviews` | HITL review records |
| `staff_corrections` | HITL corrections |
| `payment_methods` | Payment options |
| `delivery_options` | Delivery methods |
| `staff_users` | Staff info |

### Key gap: No activity logging for most staff actions
The `staff_activity_log` table exists and is used, but **only for delete actions** and some order-level actions. These critical actions are **NOT logged**:
- Sending quote link email
- Sending payment link email
- Resending quote email
- Status changes (quote_ready → awaiting_payment, etc.)
- HITL review claims and approvals
- Pricing changes, adjustment adds/removes
- Turnaround/delivery changes

### Existing timestamps on `quotes` table
- `quote_sent_at` — set when quote link is sent
- `payment_link_sent_at` — set when payment link is sent
- `payment_confirmed_at` — set when payment is confirmed

These only track the **last** occurrence. If staff sends the link twice, the first timestamp is overwritten.

---

## Proposed Solution

### Step 1: Create `quote_activity_log` table (Supabase migration)

```sql
CREATE TABLE quote_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_users(id),
  action_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_activity_log_quote_id ON quote_activity_log(quote_id);
CREATE INDEX idx_quote_activity_log_created_at ON quote_activity_log(created_at);

-- Enable RLS
ALTER TABLE quote_activity_log ENABLE ROW LEVEL SECURITY;

-- Staff can read all activity logs
CREATE POLICY "Staff can read quote activity logs"
  ON quote_activity_log FOR SELECT
  TO authenticated
  USING (true);

-- Staff can insert activity logs
CREATE POLICY "Staff can insert quote activity logs"
  ON quote_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

**Action types to track:**
| action_type | Trigger | Details (JSONB) |
|-------------|---------|-----------------|
| `quote_link_sent` | handleSendQuoteLink | `{ customer_email }` |
| `payment_link_sent` | handleSendPaymentLink | `{ customer_email, payment_url, amount }` |
| `quote_email_resent` | handleResendQuote | `{ customer_email, custom_message }` |
| `status_changed` | Any status update | `{ from_status, to_status }` |
| `hitl_review_claimed` | claimReview | `{ review_id }` |
| `hitl_review_approved` | approveQuote | `{ review_id }` |
| `revision_requested` | requestBetterScan | `{ file_id, reason }` |
| `adjustment_added` | Add discount/surcharge | `{ type, amount, reason }` |
| `adjustment_removed` | Remove adjustment | `{ adjustment_id, type, amount }` |
| `payment_recorded` | handleReceivePayment | `{ method, amount, remarks }` |
| `turnaround_changed` | Change turnaround | `{ from, to }` |
| `delivery_changed` | Change delivery | `{ from, to }` |
| `tax_rate_changed` | Change tax | `{ from_rate, to_rate }` |
| `quote_deleted` | handleDeleteQuote | `{ previous_status }` |
| `totals_recalculated` | Recalculate totals | `{ old_total, new_total }` |

### Step 2: Add a helper function for logging

Create a small utility in `client/utils/quoteActivityLog.ts`:

```typescript
import { supabase } from "../lib/supabase";

export async function logQuoteActivity(
  quoteId: string,
  staffId: string,
  actionType: string,
  details: Record<string, unknown> = {}
) {
  const { error } = await supabase.from("quote_activity_log").insert({
    quote_id: quoteId,
    staff_id: staffId,
    action_type: actionType,
    details,
  });
  if (error) console.error("Failed to log quote activity:", error);
}
```

### Step 3: Instrument existing action handlers in AdminQuoteDetail.tsx

Add `logQuoteActivity()` calls after each successful action:

1. **`handleSendQuoteLink`** (line ~1586): Log `quote_link_sent` after status update succeeds
2. **`handleSendPaymentLink`** (line ~1676): Log `payment_link_sent` after status update succeeds
3. **`handleResendQuote`** (line ~1527): Log `quote_email_resent` after success
4. **`handleDeleteQuote`** (line ~1459): Log `quote_deleted` (alongside existing `staff_activity_log` insert)
5. **`approveQuote`** (~line 1364): Log `hitl_review_approved`
6. **`claimReview`** (~line 1346): Log `hitl_review_claimed`
7. **`requestBetterScan`** (~line 1402): Log `revision_requested`
8. **`handleReceivePayment`** (~line 1783): Log `payment_recorded`
9. **Status changes**: Log `status_changed` wherever quote status is updated
10. **Adjustment/turnaround/delivery/tax changes**: Log at their respective handlers

### Step 4: Fetch and display Activity Log on the admin quote detail page

**Data fetching**: Add a query in `fetchQuoteDetails` (or a separate function):

```typescript
const { data: activityLog } = await supabase
  .from("quote_activity_log")
  .select("*, staff:staff_users(full_name)")
  .eq("quote_id", id)
  .order("created_at", { ascending: false });
```

**UI Component**: Add a new "Activity Log" card below the existing Timeline section. Display as a vertical timeline/feed:

```
Activity Log
─────────────────────────────────────
🔗 Quote link sent to john@email.com
   by Jane Smith · Feb 14, 2026 2:30 PM

💳 Payment link sent ($245.00)
   to john@email.com
   by Jane Smith · Feb 14, 2026 3:15 PM

📧 Quote email resent to john@email.com
   by Mark Johnson · Feb 14, 2026 4:00 PM

📋 Status changed: quote_ready → awaiting_payment
   by Jane Smith · Feb 14, 2026 2:30 PM
```

Each entry shows:
- **Icon** based on action_type (mail, credit card, edit, etc.)
- **Human-readable description** derived from action_type + details
- **Staff name** who performed the action
- **Timestamp** formatted relative or absolute

This gives staff immediate visibility into whether a quote/payment link was already sent, by whom, and when — preventing duplicate sends.

### Step 5: Add visual indicators for "already sent" state

In the action buttons area, show inline warnings when links have already been sent:

- Next to "Send Quote Link" button: show `"Last sent: Feb 14 at 2:30 PM by Jane"` if activity log has `quote_link_sent` entries
- Next to "Send Payment Link" button: show `"Last sent: Feb 14 at 3:15 PM by Jane"` if activity log has `payment_link_sent` entries

This prevents the need to scroll to the activity log just to check if a link was already sent.

---

## Files to modify

| File | Change |
|------|--------|
| New: `supabase migration SQL` | Create `quote_activity_log` table |
| New: `client/utils/quoteActivityLog.ts` | Helper function |
| `client/pages/admin/AdminQuoteDetail.tsx` | Add logging calls to ~10 handlers, add activity log fetch, add Activity Log UI section, add "already sent" indicators near buttons |

## Out of scope
- Customer-facing activity log (customers should not see internal staff actions)
- Edge function-side logging (keeping it client-side for simplicity; edge functions don't need changes)
- Retroactive logging of past actions (only new actions going forward)
