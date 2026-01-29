# HITL Review - Editable Sections Implementation Summary

## Overview

This document summarizes the comprehensive updates to the HITL (Human-in-the-Loop) Review system, adding full editing capabilities for Translation Details, Pricing with Discounts/Surcharges, and International Billing/Shipping Address management.

---

## ✅ Implementation Complete

### 1. **Editable Translation Details Panel**

**File:** `code/client/components/admin/hitl/EditableTranslationDetailsPanel.tsx`

**Features:**

- ✅ Edit source and target languages (dropdown from database)
- ✅ Edit purpose/intended use (dropdown from database)
- ✅ Edit country of issue (text input, international)
- ✅ Edit service province (optional)
- ✅ Edit special instructions (optional textarea)
- ✅ View/Edit modes with save confirmation
- ✅ Real-time validation (required fields)
- ✅ Database persistence to `quotes` table

**Database Fields Updated:**

- `source_language_id`
- `target_language_id`
- `intended_use_id`
- `country_of_issue`
- `service_province`
- `special_instructions`

---

### 2. **Editable Pricing Summary with Discounts & Surcharges**

**File:** `code/client/components/admin/hitl/EditablePricingSummaryPanel.tsx`

**Features:**

- ✅ Display complete pricing breakdown:
  - Subtotal
  - Certification Total
  - Rush Fee (if applicable)
  - Delivery Fee (if applicable)
  - Tax
  - **Grand Total**

- ✅ **Add Discounts:**
  - Percentage-based (e.g., 10% off)
  - Fixed amount (e.g., $25 off)
  - Requires reason/description
  - Real-time recalculation

- ✅ **Add Surcharges:**
  - Percentage-based (e.g., 15% complex terminology)
  - Fixed amount (e.g., $50 rush processing)
  - Requires reason/description
  - Real-time recalculation

- ✅ **Adjustment Management:**
  - View all adjustments with reasons
  - Delete adjustments individually
  - Auto-recalculates quote total
  - Updates tax amount automatically
  - Shows subtotal after adjustments

**Database Tables:**

- `quote_adjustments` (stores all discounts/surcharges)
  - Fields: `adjustment_type`, `value_type`, `value`, `calculated_amount`, `reason`, `created_by_staff_id`
- Updates `quotes` table with new totals

**Helper Function:**

- `calculate_quote_adjustments(quote_id)` - SQL function to sum all adjustments

---

### 3. **Editable Billing Address Panel**

**File:** `code/client/components/admin/hitl/EditableBillingAddressPanel.tsx`

**Features:**

- ✅ **International Address Support:**
  - Full Name
  - Company (optional)
  - Address Line 1 (required)
  - Address Line 2 (optional - suite, apt, etc.)
  - City (required)
  - State/Province (optional - works for any country)
  - Postal/ZIP Code (required - flexible format)
  - Country (required - any country)
  - Phone (optional)
  - Email (optional)

- ✅ **View/Edit Modes:**
  - Collapsed by default
  - Edit button to enter edit mode
  - Save/Cancel actions
  - Validation for required fields

- ✅ **Data Storage:**
  - Stored as JSONB in `quotes.billing_address`
  - Flexible structure supports any address format
  - No Canada-specific validation

**Address Structure (JSONB):**

```json
{
  "name": "John Doe",
  "company": "ABC Corp",
  "address_line1": "123 Main Street",
  "address_line2": "Suite 100",
  "city": "Toronto",
  "province": "ON",
  "postal_code": "M5V 3A8",
  "country": "Canada",
  "phone": "+1 (555) 123-4567",
  "email": "billing@company.com"
}
```

---

### 4. **Editable Shipping Address & Delivery Options Panel**

**File:** `code/client/components/admin/hitl/EditableShippingAddressPanel.tsx`

**Features:**

- ✅ **Delivery Method Selection (from database):**
  - Regular Mail ($0.00)
  - Priority Mail ($15.00)
  - Express Courier ($35.00)
  - International Courier ($75.00)
  - Office Pickup (Free)

- ✅ **Smart Address Requirements:**
  - If delivery requires address (mail/courier), address fields become required
  - If pickup selected, no address needed
  - Validation adjusts automatically

- ✅ **International Shipping Address:**
  - Same comprehensive address fields as billing
  - Full Name (required if shipping)
  - Company (optional)
  - Address Line 1 (required if shipping)
  - Address Line 2 (optional)
  - City (required if shipping)
  - State/Province (optional)
  - Postal/ZIP Code (required if shipping)
  - Country (required if shipping)
  - Phone (optional)

- ✅ **Data Storage:**
  - Shipping address: `quotes.shipping_address` (JSONB)
  - Selected delivery: `quotes.physical_delivery_option_id` (UUID)
  - Delivery fee: `quotes.delivery_fee` (auto-populated from delivery option price)

**Database Integration:**

- Fetches delivery options from `delivery_options` table
- Filters: `is_active = true AND is_physical = true`
- Automatically updates delivery fee when option changes

---

## Database Changes

### New Table: `quote_adjustments`

```sql
CREATE TABLE quote_adjustments (
  id UUID PRIMARY KEY,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  adjustment_type VARCHAR(50) CHECK (IN ('discount', 'surcharge')),
  value_type VARCHAR(20) CHECK (IN ('percentage', 'fixed')),
  value DECIMAL(10,2),
  calculated_amount DECIMAL(10,2),
  reason TEXT,
  created_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Updated Tables:

- `quotes` table already has:
  - `billing_address` (JSONB)
  - `shipping_address` (JSONB)
  - `physical_delivery_option_id` (UUID)
  - `delivery_fee` (DECIMAL)

### Delivery Options (Pre-configured):

```
ID                                  | Code                 | Name                      | Price   | Requires Address
------------------------------------|----------------------|---------------------------|---------|------------------
05e4b2c7-463f-4e72-abde-c2f53cd71d76| online_portal        | Online Portal             | $0.00   | No
42db2272-d9e3-45a1-a349-033bef8e5ddd| email                | Email Delivery            | $0.00   | No
aed1c194-16bd-423d-996c-c0e291a7870b| regular_mail         | Regular Mail              | $0.00   | Yes
e2ed6cbe-3963-416e-83e1-9821e59f5137| priority_mail        | Priority Mail             | $15.00  | Yes
7fd71dd0-8fce-4f0f-9726-a7841f505365| express_courier      | Express Courier           | $35.00  | Yes
300cff29-006a-4b55-a1f2-c51de6c9be36| international_courier| International Courier     | $75.00  | Yes
cabe990f-50c3-48ad-b88f-3e0ce710445e| pickup               | Pickup                    | $0.00   | No
```

---

## Integration in HITLPanelLayout

**Updated File:** `code/client/components/admin/hitl/HITLPanelLayout.tsx`

**New Collapsible Sections:**

1. Translation Details (now editable)
2. Pricing Summary (with discounts/surcharges)
3. **NEW:** Billing Address
4. **NEW:** Shipping & Delivery

**Props Added:**

- `onUpdate` callback for refreshing data after edits
- `staffId` for tracking who made adjustments

---

## User Experience

### For Staff in HITL Review:

1. **Translation Details:**
   - Click "Edit" button
   - Change source/target language, purpose, country
   - Click "Save Changes"
   - ✅ Quote updated immediately

2. **Pricing:**
   - View current pricing breakdown
   - Click "+ Add Discount / Surcharge"
   - Select type (discount/surcharge), value type (percentage/fixed), enter value and reason
   - Click "Add"
   - ✅ Total recalculates automatically
   - Remove adjustments with trash icon

3. **Billing Address:**
   - Click "Add" or "Edit"
   - Fill in international address fields
   - Click "Save Address"
   - ✅ Billing address stored

4. **Shipping & Delivery:**
   - Click "Add" or "Edit"
   - Select delivery method from dropdown
   - If requires address, fill in shipping address
   - Click "Save Shipping Info"
   - ✅ Delivery option and address saved, fee applied

---

## Key Benefits

✅ **International Support** - No Canada-specific validation, works for any country
✅ **Flexible Pricing** - Staff can apply custom discounts/surcharges with full audit trail
✅ **Complete Control** - All quote fields editable in HITL review
✅ **Database Integration** - Delivery options pulled from database, easy to update
✅ **Smart Validation** - Address fields required only when needed
✅ **Real-time Calculations** - Totals update immediately when adjustments added
✅ **Audit Trail** - All adjustments tracked with staff ID and reason

---

## Testing Checklist

- [ ] Edit translation details and verify database update
- [ ] Add percentage discount and verify total recalculation
- [ ] Add fixed surcharge and verify total recalculation
- [ ] Delete adjustment and verify total recalculation
- [ ] Add billing address with international format
- [ ] Select Regular Mail and add shipping address
- [ ] Select Pickup and verify no address required
- [ ] Verify delivery fee updates when delivery option changes
- [ ] Check that tax recalculates after adjustments

---

## Future Enhancements

- [ ] Add country dropdown with ISO country codes
- [ ] Add province/state dropdown based on selected country
- [ ] Postal code format validation by country
- [ ] Copy billing address to shipping address button
- [ ] Bulk adjustment templates (e.g., "Volume Discount 15%")
- [ ] Adjustment presets from database
- [ ] Address verification/autocomplete API integration

---

## Files Modified/Created

### Created:

- `code/client/components/admin/hitl/EditableTranslationDetailsPanel.tsx`
- `code/client/components/admin/hitl/EditablePricingSummaryPanel.tsx`
- `code/client/components/admin/hitl/EditableBillingAddressPanel.tsx`
- `code/client/components/admin/hitl/EditableShippingAddressPanel.tsx`

### Modified:

- `code/client/components/admin/hitl/HITLPanelLayout.tsx`

### Database:

- Applied migration: `quote_adjustments` table
- Verified: `delivery_options` table populated

---

## Notes

- All address fields are optional unless delivery method requires address
- Addresses stored as JSONB for maximum flexibility
- Discounts are negative adjustments, surcharges are positive
- All adjustments require a reason for audit purposes
- Staff ID is tracked for all adjustments
- Totals recalculate automatically on any change

---

**Implementation Date:** January 29, 2026
**Status:** ✅ Complete and Ready for Testing
