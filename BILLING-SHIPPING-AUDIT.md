# Billing & Shipping Address Audit Report

## 🔴 CRITICAL ISSUES FOUND

### Issue #1: Billing Address Missing Required Fields

**Location:** `code/client/components/quote/Step5BillingDelivery.tsx:435-467`

**Current State:**

- Billing section only shows **"Full Name"** field
- Missing: Street Address, City, Province, Postal Code

**Expected:**

- Billing address should **ALWAYS** show all fields:
  - Full Name ✅ (exists)
  - Street Address ❌ (missing)
  - City ❌ (missing)
  - Province ❌ (missing)
  - Postal Code ❌ (missing)

**Impact:** Users cannot enter complete billing information for invoices.

---

### Issue #2: Shared State Between Billing and Shipping

**Location:** `code/client/components/quote/Step5BillingDelivery.tsx:95-104, 645-729`

**Current State:**

- Both billing and shipping use the **SAME** state variable: `billingAddress`
- Lines 95-104: Single `billingAddress` state
- Lines 645-729: Shipping address fields read/write to `billingAddress`

**Problem:**

```typescript
// Line 95-104: Single state for BOTH
const [billingAddress, setBillingAddress] = useState<BillingAddress>({
  fullName: "...",
  streetAddress: "", // Used by BOTH billing and shipping
  city: "", // Used by BOTH billing and shipping
  province: "AB", // Used by BOTH billing and shipping
  postalCode: "", // Used by BOTH billing and shipping
});
```

**Expected:**

- Separate `billingAddress` state (always visible)
- Separate `shippingAddress` state (conditional)
- Allow copying billing → shipping

---

### Issue #3: Missing "Copy from Billing" Feature

**Location:** Should be above shipping address fields (line ~635)

**Current State:**

- No checkbox or button to copy billing address to shipping address
- Users must manually re-enter the same information

**Expected:**

- Checkbox: "☑ Same as billing address" above shipping fields
- When checked: Auto-populate shipping fields from billing
- When unchecked: Allow manual entry

---

## ✅ WORKING CORRECTLY

### Shipping Options Source

**Location:** `code/client/components/quote/Step5BillingDelivery.tsx:143-151`

**Supabase Query:**

```typescript
const { data: physical, error: physicalError } = await supabase
  .from("delivery_options")
  .select("*")
  .eq("delivery_group", "physical")
  .eq("is_active", true)
  .order("sort_order");
```

**Data Source:** `delivery_options` table in Supabase
**Columns Used:**

- `code` - Option identifier (e.g., 'regular_mail', 'pickup')
- `name` - Display name
- `description` - Help text
- `price` - Delivery fee
- `requires_address` - Boolean flag to show/hide shipping form
- `delivery_group` - Filter for 'physical' options
- `is_active` - Filter for active options only
- `sort_order` - Display order

**Conditional Logic (Lines 113-115):**

```typescript
const needsShippingAddress = physicalOptions
  .filter((opt) => opt.requires_address)
  .some((opt) => opt.code === selectedPhysicalOption);
```

✅ **This is working correctly** - shipping form appears when `requires_address = true`

---

## 🎯 REQUIRED FIXES

### Fix #1: Add Full Billing Address Fields

**What:** Add street, city, province, postal code to billing section
**Where:** Lines 435-467 (Billing Information section)
**Status:** ❌ Not implemented

### Fix #2: Create Separate Shipping Address State

**What:** Create new `shippingAddress` state separate from `billingAddress`
**Where:** Lines 95-104 (State declarations)
**Status:** ❌ Not implemented

### Fix #3: Add "Copy from Billing" Checkbox

**What:** Add checkbox above shipping address fields to auto-populate
**Where:** Line ~635 (above shipping address form)
**Status:** ❌ Not implemented

### Fix #4: Update Validation Logic

**What:** Validate billing address always, shipping address conditionally
**Where:** Lines 240-330 (validateForm function)
**Status:** ❌ Needs update

### Fix #5: Update Database Save Logic

**What:** Save both billing and shipping addresses separately
**Where:** Lines 334-385 (handleContinue function)
**Status:** ❌ Needs update

---

## 📋 PROPOSED ARCHITECTURE

### State Structure:

```typescript
// Always visible
const [billingAddress, setBillingAddress] = useState({
  fullName: "",
  streetAddress: "",
  city: "",
  province: "AB",
  postalCode: "",
});

// Conditionally visible
const [shippingAddress, setShippingAddress] = useState({
  fullName: "",
  streetAddress: "",
  city: "",
  province: "AB",
  postalCode: "",
});

// Copy control
const [sameAsBilling, setSameAsBilling] = useState(false);
```

### UI Flow:

1. **Billing Information** (Always visible)
   - Full Name
   - Street Address
   - City
   - Province
   - Postal Code

2. **Digital Delivery** (Always visible)
   - Online Portal (locked)
   - Email (optional)

3. **Physical Delivery** (Always visible)
   - None / Regular Mail / Priority / Express / Pickup

4. **Shipping Address** (Conditional - only when `requires_address = true`)
   - ☑ Same as billing address (checkbox)
   - Full Name (auto-filled if checked)
   - Street Address (auto-filled if checked)
   - City (auto-filled if checked)
   - Province (auto-filled if checked)
   - Postal Code (auto-filled if checked)

5. **Pickup Location** (Conditional - only when pickup selected)
   - Location details (read-only)

---

## 🔍 DATA FLOW

### Database Table: `delivery_options`

Columns referenced in code:

- `id` (UUID)
- `code` (varchar) - e.g., 'regular_mail', 'pickup'
- `name` (varchar) - Display name
- `description` (text)
- `price` (decimal)
- `delivery_group` (varchar) - 'digital' or 'physical'
- `delivery_type` (varchar) - 'ship', 'pickup', 'online'
- `requires_address` (boolean) - **KEY FIELD** for conditional shipping form
- `is_active` (boolean)
- `is_always_selected` (boolean)
- `sort_order` (integer)

### Expected Values in Database:

| code            | requires_address | Shows Shipping Form? |
| --------------- | ---------------- | -------------------- |
| regular_mail    | `true`           | ✅ Yes               |
| priority_mail   | `true`           | ✅ Yes               |
| express_courier | `true`           | ✅ Yes               |
| pickup          | `false`          | ❌ No                |
| none            | N/A              | ❌ No                |

---

## 📝 NEXT STEPS

1. ✅ Audit complete (this document)
2. ⏳ Await user confirmation to proceed with fixes
3. ⏳ Implement separate billing/shipping state
4. ⏳ Add billing address fields (always visible)
5. ⏳ Add "Copy from billing" checkbox
6. ⏳ Update validation logic
7. ⏳ Update database save logic
8. ⏳ Test all delivery options
9. ⏳ Verify database persistence

---

## 🎯 SUMMARY

**What's Broken:**

- ❌ Billing address missing required fields
- ❌ Billing and shipping share same state
- ❌ No "copy from billing" feature

**What's Working:**

- ✅ Shipping options loaded from Supabase correctly
- ✅ Conditional shipping form logic working
- ✅ `requires_address` flag respected

**Root Cause:**
After Supabase update, billing section was simplified to only "Full Name" but should have remained as full address form.
