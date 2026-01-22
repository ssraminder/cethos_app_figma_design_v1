# Step 6 Payment - Quick Testing Guide

## ✅ Implementation Complete!

The payment flow is ready to test. Follow these steps:

---

## 🚀 Quick Test (5 Minutes)

### 1. Complete the Quote Flow (Steps 1-5)

**Step 1 - Upload:**

- Upload 1-2 test documents (any PDF or image)
- Click Continue

**Step 2 - Details:**

- Source Language: Spanish
- Target Language: English
- Document Type: Birth Certificate
- Intended Use: IRCC
- Click Continue

**Step 3 - Contact:**

- Customer Type: Individual
- First Name: Test
- Last Name: User
- Email: your-email@example.com
- Phone: (403) 555-1234
- Click Continue

**Step 4 - Review & Rush:**

- Select "Standard" or "Rush" or "Same-Day"
- Review pricing
- Click Continue

**Step 5 - Billing & Delivery:**

- **Billing Address:**
  - Full Name: Test User
  - Street: 123 Test St
  - City: Calgary
  - Province: Alberta
  - Postal Code: T2P 1J9
- **Physical Delivery:** Select "Regular Mail" (or any option)
- **Shipping Address:** Check "Same as billing address"
- Click "Proceed to Payment"

---

### 2. Test Step 6 Payment

**What to Verify:**

- [ ] Order summary displays correctly
- [ ] Shows all price components:
  - Translation cost
  - Certification cost (if applicable)
  - Rush fee (if selected)
  - Delivery fee
  - GST (5%)
  - Total amount
- [ ] Billing address is displayed
- [ ] "Secure payment powered by Stripe" badge shows
- [ ] "Pay $XXX.XX CAD" button is enabled

**Click the Pay Button:**

- [ ] Loading spinner appears
- [ ] Redirected to Stripe Checkout page

---

### 3. Complete Payment on Stripe

**Use Stripe Test Card:**

```
Card Number: 4242 4242 4242 4242
Expiry: 12/34 (any future date)
CVC: 123 (any 3 digits)
ZIP: 12345 (any 5 digits)
```

**Complete Payment:**

- [ ] Enter card details
- [ ] Click "Pay" on Stripe
- [ ] Wait for processing

---

### 4. Verify Order Success Page

**After Payment:**

- [ ] Redirected to `/order/success?session_id=...`
- [ ] Green success header appears
- [ ] Order number displays
- [ ] Amount paid is correct
- [ ] Order status shows "paid" or similar
- [ ] "Confirmation Email Sent" notice appears
- [ ] "What happens next?" steps display
- [ ] "Return to Home" button works

---

## 🐛 Troubleshooting

### Payment Button Disabled

**Cause:** No pricing data available
**Fix:** Go back to Step 5, make sure a delivery option is selected, then proceed to Step 6

### Redirects but stays on same page

**Cause:** Edge Function `create-checkout-session` not deployed
**Fix:** Deploy Edge Functions (see backend deployment guide)

### Order Success shows "Processing Your Order"

**Cause:** Webhook delay (normal - will retry automatically)
**Wait:** Page will auto-load order details after 2 seconds

### Order not found after payment

**Cause:** Webhook failed or not configured
**Fix:**

1. Check Stripe webhook is configured
2. Verify webhook secret matches
3. Check Supabase Edge Function logs

---

## 📊 Database Verification

After successful payment, check database:

```sql
-- Latest quote
SELECT
  id,
  quote_number,
  stripe_checkout_session_id,
  converted_to_order_id,
  calculated_totals
FROM quotes
ORDER BY created_at DESC
LIMIT 1;

-- Latest payment
SELECT
  id,
  order_id,
  stripe_checkout_session_id,
  amount,
  status,
  created_at
FROM payments
ORDER BY created_at DESC
LIMIT 1;

-- Latest order
SELECT
  id,
  order_number,
  total_amount,
  status,
  estimated_delivery_date
FROM orders
ORDER BY created_at DESC
LIMIT 1;
```

---

## ✅ Success Criteria

**All Tests Passed When:**

- ✅ Can navigate through all 6 steps
- ✅ Step 6 displays correct pricing
- ✅ Stripe Checkout opens
- ✅ Payment completes successfully
- ✅ Order Success page loads
- ✅ Order details are correct
- ✅ Order is in database
- ✅ Payment is in database

---

## 🎯 Test Cards (Stripe Test Mode)

### Successful Payment:

- `4242 4242 4242 4242` - Visa
- `5555 5555 5555 4444` - Mastercard
- `3782 822463 10005` - American Express

### Declined Payment (for error testing):

- `4000 0000 0000 0002` - Card declined
- `4000 0000 0000 9995` - Insufficient funds

---

## 📝 Next Steps After Testing

1. **If Tests Pass:**
   - Ready for staging deployment
   - Can proceed to production testing

2. **If Tests Fail:**
   - Check Edge Function logs
   - Verify Stripe webhook configuration
   - Review database RLS policies
   - Check console for errors

---

## 🆘 Need Help?

**Common Issues:**

- Edge Functions not deployed → Deploy via Supabase CLI
- Webhook not working → Check Stripe dashboard webhook logs
- Pricing shows $0.00 → Verify Step 4 calculations saved
- Session ID missing → Check Stripe redirect URL configuration

**Support:**

- Review: `STEP6-PAYMENT-IMPLEMENTATION-SUMMARY.md`
- Email: support@cethos.com
