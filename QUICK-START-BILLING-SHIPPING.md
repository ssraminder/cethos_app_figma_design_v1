# Quick Start: Billing & Shipping Address Fix

## ✅ Implementation Complete!

All changes have been implemented. Follow these steps to test:

---

## 🚀 Step 1: Run Database Migration

**Important:** The database needs a new column `billing_address` added to the `quotes` table.

### Option A: Run Full Migration Script
1. Open Supabase SQL Editor
2. Copy contents from `code/database-setup-step4-step5.sql`
3. Execute the script
4. Verify the output shows row counts

### Option B: Run Just the Billing Address Column Addition
```sql
-- Add billing_address column to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS billing_address JSONB;
```

---

## 🧪 Step 2: Test the Implementation

### Test 1: Billing Address (Always Visible)
1. Navigate to Step 5 (Billing & Delivery)
2. **Verify:** Billing Information section shows:
   - ✅ Full Name
   - ✅ Street Address
   - ✅ City
   - ✅ Province dropdown
   - ✅ Postal Code
3. Leave all fields empty and click Continue
4. **Verify:** Error messages appear for all billing fields

### Test 2: No Physical Delivery
1. Fill out billing address completely
2. Select **"No physical copy needed"**
3. **Verify:** No shipping address form appears
4. Click Continue
5. **Verify:** Can proceed successfully

### Test 3: Shipping Address - Regular Mail
1. Fill out billing address
2. Select **"Regular Mail"**
3. **Verify:** Shipping Address section appears
4. **Verify:** "Same as billing address" checkbox is visible
5. Leave shipping fields empty
6. Click Continue
7. **Verify:** Error messages appear for shipping fields

### Test 4: "Same as Billing" Checkbox
1. Fill out billing address completely
2. Select "Regular Mail"
3. **Check** the "Same as billing address" checkbox
4. **Verify:**
   - ✅ All shipping fields auto-populate from billing
   - ✅ All shipping fields are disabled (gray background)
   - ✅ Can't edit shipping fields
5. **Uncheck** the checkbox
6. **Verify:**
   - ✅ Shipping fields become editable
   - ✅ Previously copied data remains (can be modified)

### Test 5: Auto-Sync When Checked
1. Fill out billing address
2. Select "Regular Mail"
3. **Check** "Same as billing address"
4. Change billing street address
5. **Verify:** Shipping street address updates instantly
6. Change billing city
7. **Verify:** Shipping city updates instantly

### Test 6: Pickup Selection
1. Fill out billing address
2. Select **"Pickup from Office"**
3. **Verify:**
   - ❌ Shipping address form does NOT appear
   - ✅ Pickup location details appear
4. Click Continue
5. **Verify:** Can proceed successfully

### Test 7: Switching Between Options
1. Fill out billing address
2. Select "Regular Mail" → shipping form appears
3. Check "Same as billing" → fields populate
4. Switch to "Pickup" → shipping form disappears
5. Switch back to "Regular Mail"
6. **Verify:** Shipping form reappears with previous data

### Test 8: Database Persistence
1. Complete all fields and select Regular Mail
2. Click Continue to proceed to Step 6
3. Click Back to return to Step 5
4. **Verify:**
   - ✅ Billing address fields are pre-filled
   - ✅ Shipping address fields are pre-filled
   - ✅ Selected delivery option is pre-selected

### Test 9: Validation
1. Enter invalid postal code (e.g., "12345")
2. Blur the field
3. **Verify:** Error message appears
4. Enter valid postal code (e.g., "T2P 1J9")
5. **Verify:** Error disappears

---

## 📊 Quick Reference

### When Does Shipping Form Appear?
| Delivery Option | Shipping Form | Reason                        |
|-----------------|---------------|-------------------------------|
| None            | ❌ No         | No physical delivery          |
| Pickup          | ❌ No         | `requires_address = false`    |
| Regular Mail    | ✅ Yes        | `requires_address = true`     |
| Priority Mail   | ✅ Yes        | `requires_address = true`     |
| Express Courier | ✅ Yes        | `requires_address = true`     |

### What's Always Required?
- ✅ Billing Full Name
- ✅ Billing Street Address
- ✅ Billing City
- ✅ Billing Province
- ✅ Billing Postal Code

### What's Conditionally Required?
- Shipping address fields (only when mail/courier selected)
- Pickup location (only when pickup selected and multiple locations exist)

---

## 🐛 Troubleshooting

### Issue: Shipping form doesn't appear for Regular Mail
**Cause:** Database `requires_address` column not set to `true`

**Fix:**
```sql
UPDATE delivery_options 
SET requires_address = TRUE 
WHERE code IN ('regular_mail', 'priority_mail', 'express_courier', 'international_courier');
```

### Issue: TypeScript errors about `billingAddress` in context
**Cause:** Context not updated

**Fix:** Already implemented in `QuoteContext.tsx` - restart dev server if needed

### Issue: Database error when saving
**Cause:** Missing `billing_address` column

**Fix:** Run the migration SQL from Step 1

---

## 📝 Files Changed

| File | Changes |
|------|---------|
| `Step5BillingDelivery.tsx` | Separated billing/shipping states, added checkbox, updated validation |
| `QuoteContext.tsx` | Added `billingAddress` to state interface |
| `database-setup-step4-step5.sql` | Added `billing_address` column, set `requires_address = TRUE` |

---

## 🎯 Summary of What's Fixed

**Before:**
- ❌ Billing section only showed "Full Name"
- ❌ Billing and shipping shared same state variable
- ❌ No way to copy billing to shipping

**After:**
- ✅ Billing shows ALL fields (name, street, city, province, postal)
- ✅ Shipping has separate state and fields
- ✅ "Same as billing" checkbox auto-copies and disables fields
- ✅ Both addresses saved separately to database
- ✅ Smart validation - only validates what's required

---

## ✅ Ready to Test!

The implementation is complete. Just run the database migration and start testing! 🚀

**Questions?** Check the detailed documentation in:
- `BILLING-SHIPPING-AUDIT.md` - Original audit findings
- `BILLING-SHIPPING-IMPLEMENTATION-SUMMARY.md` - Complete implementation details
