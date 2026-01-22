# Quote Review Page - Quick Testing Guide

## ✅ Ready to Test!

The Quote Review Page is ready. Follow these steps to test it.

---

## 🚀 Quick Test (3 Minutes)

### Step 1: Get a Quote ID

You need an existing quote ID from your database.

**Option A: Use an existing quote**

```sql
-- Get a quote ID from database
SELECT id, quote_number, status FROM quotes ORDER BY created_at DESC LIMIT 5;
```

**Option B: Complete the quote flow**

1. Go to homepage
2. Upload a document
3. Complete steps 1-5
4. Note the quote ID from the URL or database

---

### Step 2: Access the Quote Review Page

**URL Format:**

```
http://localhost:8080/quote/{QUOTE_ID}/review
```

**Example:**

```
http://localhost:8080/quote/550e8400-e29b-41d4-a716-446655440000/review
```

**Replace `{QUOTE_ID}` with your actual quote ID**

---

### Step 3: Verify Display

**Check these elements load:**

- [ ] Quote number displays (e.g., "Quote #Q-2025-001")
- [ ] Customer name shows
- [ ] Status badge appears with color
- [ ] Documents list shows all files
- [ ] Price summary displays correctly
- [ ] Total matches expected amount

---

### Step 4: Test Different Statuses

Update quote status in database and reload page:

**Test Status: quote_ready**

```sql
UPDATE quotes SET status = 'quote_ready' WHERE id = 'your-quote-id';
```

**Expected:**

- Green "Ready to Pay" badge
- "Pay $XX.XX CAD" button visible
- No warning messages

---

**Test Status: hitl_pending**

```sql
UPDATE quotes SET status = 'hitl_pending' WHERE id = 'your-quote-id';
```

**Expected:**

- Yellow "Under Review" badge
- No payment button
- Message: "Quote is being reviewed by our team"

---

**Test Status: paid**

```sql
UPDATE quotes SET status = 'paid' WHERE id = 'your-quote-id';
```

**Expected:**

- Green "Paid" badge
- No payment button
- Confirmation message with checkmark

---

### Step 5: Test Payment Flow

**For quotes with status = 'quote_ready':**

1. Click the green "Pay $XX.XX CAD" button
2. **Expected:** Loading spinner appears
3. **Expected:** Redirects to Stripe Checkout

**Note:** If Edge Function not deployed, you'll see an error message

---

### Step 6: Test Error Handling

**Invalid Quote ID:**

```
http://localhost:8080/quote/invalid-id-12345/review
```

**Expected:**

- Red error icon
- "Quote Not Found" message
- "Return to Home" button

---

## 🎯 Status-Based Test Matrix

| Status          | Badge Color | Payment Button | Message                        |
| --------------- | ----------- | -------------- | ------------------------------ |
| draft           | Gray        | ❌ No          | "Quote is being prepared"      |
| processing      | Blue        | ❌ No          | "Documents are being analyzed" |
| hitl_pending    | Yellow      | ❌ No          | "Under review by our team"     |
| quote_ready     | Green       | ✅ Yes         | "Ready for payment"            |
| approved        | Green       | ✅ Yes         | "Ready for payment"            |
| pending_payment | Orange      | ✅ Yes         | "Complete your payment"        |
| paid            | Green       | ❌ No          | "Payment received"             |
| converted       | Green       | ❌ No          | "Order being processed"        |
| expired         | Red         | ❌ No          | "Quote has expired"            |

---

## 📊 Database Verification

After viewing a quote, check what data was fetched:

```sql
-- Verify quote data
SELECT
  id,
  quote_number,
  status,
  total,
  calculated_totals
FROM quotes
WHERE id = 'your-quote-id';

-- Verify customer link
SELECT
  q.quote_number,
  c.first_name,
  c.last_name,
  c.email
FROM quotes q
JOIN customers c ON c.id = q.customer_id
WHERE q.id = 'your-quote-id';

-- Verify documents
SELECT
  ar.id,
  qf.original_filename,
  ar.detected_language,
  ar.billable_pages,
  ar.line_total
FROM ai_analysis_results ar
LEFT JOIN quote_files qf ON qf.id = ar.quote_file_id
WHERE ar.quote_id = 'your-quote-id'
  AND ar.processing_status = 'complete';
```

---

## 🐛 Common Issues & Fixes

### Issue: Page shows "Loading..." forever

**Cause:** Quote ID doesn't exist or network error
**Fix:**

- Check browser console for errors
- Verify quote ID exists in database
- Check Supabase connection

### Issue: No documents shown

**Cause:** No completed analysis results
**Fix:**

```sql
-- Check if analysis completed
SELECT * FROM ai_analysis_results
WHERE quote_id = 'your-quote-id';

-- If status is not 'complete', processing may still be running
```

### Issue: Price shows $0.00

**Cause:** Missing `calculated_totals` or no documents
**Fix:**

```sql
-- Check calculated totals
SELECT calculated_totals FROM quotes WHERE id = 'your-quote-id';

-- Should return JSONB with totals
```

### Issue: Payment button doesn't work

**Cause:** Edge Function not deployed
**Fix:** Deploy `create-checkout-session` Edge Function

### Issue: Status badge wrong color

**Cause:** Status value doesn't match expected values
**Fix:** Check status value in database matches one of the supported statuses

---

## ✅ Success Criteria

**Test is successful when:**

- ✅ Page loads without errors
- ✅ Quote details display correctly
- ✅ Documents list populates
- ✅ Price breakdown is accurate
- ✅ Status badge matches database
- ✅ Payment button appears for payable statuses
- ✅ Error handling works for invalid IDs

---

## 📧 Email Link Testing

**Simulate email click:**

1. Copy the quote review URL
2. Open in private/incognito window
3. Verify page loads independently
4. Check all data displays correctly
5. Test payment flow

**This simulates a customer clicking an email link**

---

## 🎬 Full Flow Test

### Complete End-to-End Test:

1. **Create Quote:**
   - Go to homepage
   - Upload document
   - Complete all 6 steps (without paying)

2. **Get Quote ID:**

   ```sql
   SELECT id FROM quotes ORDER BY created_at DESC LIMIT 1;
   ```

3. **Access Review Page:**

   ```
   http://localhost:8080/quote/{QUOTE_ID}/review
   ```

4. **Verify Display:**
   - All details match what was entered
   - Pricing is correct
   - Status shows "Ready to Pay"

5. **Test Payment:**
   - Click "Pay" button
   - Verify Stripe redirect

6. **Complete Payment:**
   - Use test card: `4242 4242 4242 4242`
   - Complete checkout

7. **Return to Review:**
   - Go back to review URL
   - Status should now be "Paid"
   - Payment button should be hidden
   - Confirmation message should show

---

## 🔍 Visual Inspection Checklist

- [ ] Header looks clean and professional
- [ ] Status badge has appropriate color
- [ ] Documents section is well-formatted
- [ ] Price summary is easy to read
- [ ] Estimated delivery date shows correctly
- [ ] Payment button is prominent (when applicable)
- [ ] Security badge displays under payment button
- [ ] Mobile responsive (test on narrow viewport)
- [ ] Loading spinner shows while fetching
- [ ] Error states look good

---

## 📱 Mobile Testing

**Test on mobile viewport:**

1. Open DevTools
2. Toggle device toolbar
3. Select iPhone or Android device
4. Verify:
   - [ ] Page scrolls smoothly
   - [ ] Text is readable
   - [ ] Buttons are tappable
   - [ ] No horizontal scroll
   - [ ] Documents list wraps properly

---

## 🚀 Production Readiness

**Before going live:**

- [ ] Test with real quote data
- [ ] Verify all statuses work
- [ ] Test payment flow end-to-end
- [ ] Check mobile responsiveness
- [ ] Verify error handling
- [ ] Test expired quote display
- [ ] Confirm email links work
- [ ] Check loading performance
- [ ] Verify security (no sensitive data exposed)
- [ ] Test with multiple browsers

---

## 📞 Support

**If you encounter issues:**

1. Check browser console for errors
2. Verify database connectivity
3. Confirm Edge Functions deployed
4. Check quote status in database
5. Verify RLS policies allow access

**Test Data:**

```sql
-- Create a test quote for testing
INSERT INTO quotes (
  id,
  quote_number,
  customer_id,
  status,
  total
) VALUES (
  gen_random_uuid(),
  'TEST-001',
  (SELECT id FROM customers LIMIT 1),
  'quote_ready',
  100.00
);
```

---

## ✨ Quick Reference

**Test URLs:**

- Valid quote: `/quote/{valid-id}/review`
- Invalid quote: `/quote/invalid-123/review`
- Home fallback: `/`

**Test Cards:**

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

**Status Updates:**

```sql
UPDATE quotes SET status = 'quote_ready' WHERE id = 'xxx';
UPDATE quotes SET status = 'hitl_pending' WHERE id = 'xxx';
UPDATE quotes SET status = 'paid' WHERE id = 'xxx';
```

---

## 🎉 Happy Testing!

The Quote Review Page is ready to go. Test thoroughly and it will work beautifully in production!

**Next Steps:**

1. Complete all tests above
2. Fix any issues found
3. Deploy to staging
4. Configure email templates with quote links
5. Deploy to production

**Ready!** 🚀
