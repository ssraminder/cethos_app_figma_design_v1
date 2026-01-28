# Reject Quote Permanent - Edge Function

## Purpose

This Edge Function handles permanent quote rejection in the HITL review workflow. It:

1. Updates the HITL review status to "rejected"
2. **Does NOT update quote status** (quote remains in current state - "rejected" is not a valid quote status)
3. Logs the staff activity
4. Optionally sends a rejection email to the customer (Template #19)

**Note**: The quote status constraint only allows: `draft`, `details_pending`, `quote_ready`, `awaiting_payment`, `paid`, `in_progress`, `completed`. Rejection is tracked via the HITL review status only.

## Deployment

### Prerequisites

- Supabase CLI installed (`npm install -g supabase`)
- Logged in to Supabase CLI (`supabase login`)
- Project linked (`supabase link --project-ref <your-project-ref>`)

### Deploy Command

```bash
cd code
supabase functions deploy reject-quote-permanent
```

### Environment Variables Required

The function uses these environment variables (automatically available in Supabase):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)
- `SUPABASE_ANON_KEY` - Anonymous key for email function call

## Request Format

```typescript
POST /functions/v1/reject-quote-permanent

{
  "reviewId": "uuid",      // HITL review ID
  "staffId": "uuid",       // Staff member performing rejection
  "reason": "string",      // Reason for rejection
  "sendEmail": boolean     // Whether to send rejection email
}
```

## Response Format

### Success (200)

```json
{
  "success": true,
  "message": "Quote rejected successfully"
}
```

### Error (400/500)

```json
{
  "success": false,
  "error": "Error message"
}
```

## Database Operations

Uses **service role key** to bypass RLS for:

1. **hitl_reviews** table:
   - Updates `status`, `completed_at`, `completed_by`, `resolution_notes`

2. **quotes** table:
   - Updates `status`, `updated_at`

3. **staff_activity_log** table:
   - Inserts activity record with action_type: "reject_quote_permanent"

4. **customers** table (read-only):
   - Fetches email and name for notification

## Email Template

Uses template ID **19** with parameters:
- `CUSTOMER_NAME` - Customer's full name
- `QUOTE_NUMBER` - Quote reference number
- `REJECTION_REASON` - Staff-provided reason
- `SUPPORT_EMAIL` - support@cethos.com

## Error Handling

- Email failure doesn't block the rejection operation
- Activity logging failure is logged but doesn't fail the operation
- Database errors return 500 with error message

## Testing

After deployment, test with:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/reject-quote-permanent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "reviewId": "test-review-id",
    "staffId": "test-staff-id",
    "reason": "Test rejection",
    "sendEmail": false
  }'
```

## Related Functions

- `approve-hitl-review` - Approves quote for customer payment
- `reject-hitl-review` - Requests better scan from customer (soft reject)
- `send-email` - Sends templated emails
