# Manual Quote Form - Steps 4 & 5 Implementation Plan

## Step 4: Per-File Pricing & Quote-Level Adjustments

### Overview

Calculate pricing for each uploaded file individually, then aggregate to quote-level totals with adjustments.

---

### PART A: Per-File Pricing Cards

#### For Each File, Display:

**1. File Header (Read-only Display)**

- **File Name**: `file.name`
- **Source**: From `FileWithAnalysis.name`
- **Actions**: None (display only)

**2. Detected Language Override**

- **Field**: Dropdown (editable)
- **Source**: Initially from `file.detectedLanguageCode` (AI analysis)
- **Options**: Query `languages` table
  ```sql
  SELECT id, code, name, native_name, multiplier
  FROM languages
  WHERE is_active = true
  ORDER BY sort_order, name
  ```
- **Default Value**: `file.detectedLanguageCode` or first language match
- **Purpose**: Allow manual override of AI-detected language
- **Affects**: `languageMultiplier` in pricing calculation

**3. Document Type Override**

- **Field**: Dropdown (editable)
- **Source**: Initially from `file.detectedDocumentType` (AI analysis)
- **Options**: Query `document_types` table
  ```sql
  SELECT id, code, name, typical_complexity
  FROM document_types
  WHERE is_active = true
  ORDER BY sort_order, name
  ```
- **Default Value**: `file.detectedDocumentType` or "Other"
- **Purpose**: Classify document for reference (doesn't affect pricing directly)
- **Actions**: Updates `file.documentTypeId`

**4. Page Count Override**

- **Field**: Number input (editable)
- **Source**: Initially from `file.pageCount` (AI analysis)
- **Min**: 1
- **Max**: 999
- **Default**: `file.pageCount` or 1
- **Purpose**: Allow manual correction of AI page detection
- **Affects**: Direct input to pricing calculation

**5. Billable Pages**

- **Field**: Number input with decimal (editable)
- **Source**: Defaults to same as Page Count
- **Min**: 0.5
- **Max**: 999.99
- **Step**: 0.5 (allow half pages)
- **Default**: `file.pageCount`
- **Purpose**: Sometimes actual pages ≠ billable pages (e.g., cover page free)
- **Affects**: Direct input to pricing calculation

**6. Complexity Override**

- **Field**: Dropdown (editable)
- **Source**: Initially from `file.complexity` (AI analysis)
- **Options**:
  - Low (1.0x) - Simple text
  - Medium (1.15x) - Technical content
  - High (1.30x) - Legal/specialized terminology
- **Default**: `file.complexity` or "Low"
- **Multiplier Mapping**:
  ```typescript
  {
    'low': 1.00,
    'medium': 1.15,
    'high': 1.30
  }
  ```
- **Purpose**: Adjust for document difficulty
- **Affects**: `complexityMultiplier` in pricing calculation

**7. Certification Type**

- **Field**: Dropdown (editable)
- **Source**: Query `certification_types` table
  ```sql
  SELECT id, code, name, price, is_default
  FROM certification_types
  WHERE is_active = true
  ORDER BY sort_order, name
  ```
- **Options**:
  - None ($0)
  - Standard Certification ($25)
  - Notarized ($45)
  - Apostille ($75)
- **Default**: From `intended_uses.default_certification_type_id` OR "Standard"
- **Purpose**: Required certification level per document
- **Affects**: `certificationCost` in pricing calculation

**8. Per-File Price Breakdown (Read-only, Auto-calculated)**

```typescript
// Calculation Logic
const baseRate = 65.00; // From app_settings or hardcoded

// Get language multiplier
const language = await getLanguageById(file.languageId);
const languageMultiplier = language.multiplier || 1.0;

// Get complexity multiplier
const complexityMultiplier = {
  'low': 1.0,
  'medium': 1.15,
  'high': 1.30
}[file.complexity];

// Calculate translation cost
file.translationCost =
  baseRate ×
  file.billablePages ×
  languageMultiplier ×
  complexityMultiplier;

// Get certification cost
file.certificationCost = file.certificationTypePrice || 0;

// Calculate line total
file.lineTotal = file.translationCost + file.certificationCost;
```

**Display Format**:

```
┌─────────────────────────────────────────┐
│ Translation Calculation                 │
├─────────────────────────────────────────┤
│ Base Rate:              $65.00 / page   │
│ × Billable Pages:       3.5             │
│ × Language Tier:        1.0x (Spanish)  │
│ × Complexity:           1.15x (Medium)  │
│ ─────────────────────────────────────   │
│ Translation Cost:       $263.38         │
│                                         │
│ Certification:          Standard ($25)  │
│ ─────────────────────────────────────   │
│ File Total:            $288.38          │
└─────────────────────────────────────────┘
```

---

### PART B: Quote-Level Pricing Summary

#### Fields:

**1. Document Subtotal (Auto-calculated, Read-only)**

- **Calculation**: Sum of all `file.lineTotal`
  ```typescript
  const documentSubtotal = files.reduce((sum, file) => sum + file.lineTotal, 0);
  ```
- **Display**: `$XXX.XX`

**2. Rush Service Toggle**

- **Field**: Checkbox
- **Source**: User input
- **Default**: `false`
- **Label**: "Rush Service (30% surcharge)"
- **Description**: "Expedite translation - reduces turnaround time"
- **Affects**: Adds `rushFee` to total

**3. Rush Fee (Auto-calculated, Read-only)**

- **Calculation**:
  ```typescript
  const rushFee = isRush ? documentSubtotal × 0.30 : 0;
  ```
- **Source**: `delivery_options` table where `code = 'rush'`
  ```sql
  SELECT multiplier FROM delivery_options
  WHERE code = 'rush' AND is_active = true
  ```
- **Display**: Only shown if rush is selected
- **Format**: `+$XXX.XX` (in amber/warning color)

**4. Physical Delivery Option**

- **Field**: Dropdown
- **Source**: Query `delivery_options` table
  ```sql
  SELECT id, code, name, price, estimated_days
  FROM delivery_options
  WHERE category = 'delivery'
    AND is_active = true
  ORDER BY sort_order
  ```
- **Options**:
  - Pickup at Office ($0, 0 days)
  - Standard Shipping ($15, 3-5 days)
  - Express Shipping ($35, 1-2 days)
  - Courier Service ($50, Same day)
- **Default**: "Pickup at Office"
- **Affects**: `deliveryFee`

**5. Delivery Fee (Auto-calculated, Read-only)**

- **Calculation**: Selected delivery option's price
  ```typescript
  const deliveryFee = selectedDeliveryOption?.price || 0;
  ```
- **Display**: `$XXX.XX`

**6. Discount Section (Optional)**

- **Toggle**: "Apply Discount" checkbox
- **When Enabled**:

  **Discount Type**:
  - Radio: "Fixed Amount" or "Percentage"

  **Discount Value**:
  - Number input
  - If percentage: 0-100% range
  - If fixed: $0 - $9999.99

  **Discount Reason** (Required when discount > 0):
  - Textarea
  - Max 500 characters
  - Placeholder: "Reason for discount (e.g., loyal customer, promotional offer)"
  - Validation: Required if discount applied

  **Calculated Discount Amount**:

  ```typescript
  const discountAmount = discountType === 'percentage'
    ? documentSubtotal × (discountValue / 100)
    : discountValue;
  ```

**7. Surcharge Section (Optional)**

- **Toggle**: "Apply Surcharge" checkbox
- **When Enabled**:

  **Surcharge Type**:
  - Radio: "Fixed Amount" or "Percentage"

  **Surcharge Value**:
  - Number input
  - If percentage: 0-100% range
  - If fixed: $0 - $9999.99

  **Surcharge Reason** (Required when surcharge > 0):
  - Textarea
  - Max 500 characters
  - Placeholder: "Reason for surcharge (e.g., difficult content, tight deadline)"
  - Validation: Required if surcharge applied

  **Calculated Surcharge Amount**:

  ```typescript
  const surchargeAmount = surchargeType === 'percentage'
    ? documentSubtotal × (surchargeValue / 100)
    : surchargeValue;
  ```

**8. Pre-tax Total (Auto-calculated, Read-only)**

- **Calculation**:
  ```typescript
  const preTaxTotal =
    documentSubtotal + rushFee + deliveryFee + surchargeAmount - discountAmount;
  ```
- **Display**: `$XXX.XX`

**9. Tax Rate (Auto-detected or manual)**

- **Field**: Read-only display with option to override
- **Source**: Query `tax_rates` table based on service province
  ```sql
  SELECT rate, tax_name
  FROM tax_rates
  WHERE region_code = ?
    AND is_active = true
    AND (effective_from IS NULL OR effective_from <= NOW())
    AND (effective_to IS NULL OR effective_to >= NOW())
  ORDER BY rate DESC
  LIMIT 1
  ```
- **Default**: 0.05 (5% GST) for Alberta
- **Display**: "5% GST" or similar
- **Override**: Allow manual selection if needed

**10. Tax Amount (Auto-calculated, Read-only)**

- **Calculation**:
  ```typescript
  const taxAmount = preTaxTotal × taxRate;
  ```
- **Display**: `$XXX.XX`

**11. Final Total (Auto-calculated, Read-only)**

- **Calculation**:
  ```typescript
  const total = preTaxTotal + taxAmount;
  ```
- **Display**: Large, bold `$XXX.XX`

---

### Data Structure for Step 4:

```typescript
interface FilePrice {
  fileId: string; // Reference to FileWithAnalysis.id

  // Editable fields
  languageId: string;
  documentTypeId?: string;
  pageCount: number;
  billablePages: number;
  complexity: "low" | "medium" | "high";
  certificationTypeId: string;

  // Calculated fields
  baseRate: number;
  languageMultiplier: number;
  complexityMultiplier: number;
  translationCost: number;
  certificationCost: number;
  lineTotal: number;
}

interface QuotePricing {
  // Per-file pricing
  filePrices: FilePrice[];

  // Quote-level fields
  documentSubtotal: number;
  isRush: boolean;
  rushFee: number;
  deliveryOptionId: string;
  deliveryFee: number;

  // Adjustments
  hasDiscount: boolean;
  discountType?: "fixed" | "percentage";
  discountValue?: number;
  discountAmount: number;
  discountReason?: string;

  hasSurcharge: boolean;
  surchargeType?: "fixed" | "percentage";
  surchargeValue?: number;
  surchargeAmount: number;
  surchargeReason?: string;

  // Totals
  preTaxTotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}
```

---

### Actions & Edge Function Calls:

**1. Auto-Calculate on Any Change**

- **Trigger**: Any field update
- **Action**: Recalculate all totals in real-time
- **No API call**: Pure client-side calculation

**2. Optional: Server-Side Validation**

- **Edge Function**: `calculate-manual-quote-pricing`
- **When**: Before proceeding to Step 5
- **Purpose**: Verify calculations match server-side logic
- **Input**:
  ```typescript
  {
    quoteId: string,
    filePrices: FilePrice[],
    isRush: boolean,
    deliveryOptionId: string,
    discountAmount?: number,
    surchargeAmount?: number
  }
  ```
- **Output**: Validated pricing breakdown

---

## Step 5: Review & Confirm

### Overview

Display all quote information for final review before creation.

---

### Section 1: Customer Summary

**Data Source**: From Step 1 (`CustomerData`)

**Fields (Read-only)**:

- Full Name: `customer.fullName`
- Email: `customer.email`
- Phone: `customer.phone`
- Customer Type: `customer.customerType` (Individual/Business)
- Company Name: `customer.companyName` (if business)

**Actions**:

- "Edit" button → Go back to Step 1

---

### Section 2: Translation Details Summary

**Data Source**: From Step 2 (`QuoteData`)

**Fields (Read-only)**:

- Source Language: Query language name from `languages` table
  ```typescript
  const sourceLang = await getLanguageById(quote.sourceLanguageId);
  // Display: "Spanish (Español)"
  ```
- Target Language: Query language name from `languages` table
  ```typescript
  const targetLang = await getLanguageById(quote.targetLanguageId);
  // Display: "English"
  ```
- Language Pair Display: `"Spanish → English"`
- Intended Use: Query from `intended_uses` table
  ```typescript
  const intendedUse = await getIntendedUseById(quote.intendedUseId);
  // Display: "Immigration - Visa Application"
  ```
- Country of Issue: Query from `countries` table (if provided)
  ```typescript
  const country = await getCountryByCode(quote.countryOfIssue);
  // Display: "Canada"
  ```
- Special Instructions: `quote.specialInstructions` (if provided)

**Actions**:

- "Edit" button → Go back to Step 2

---

### Section 3: Files & Analysis Summary

**Data Source**: From Step 3 (`FileWithAnalysis[]`)

**For Each File, Display**:

**File Card**:

```
┌──────────────────────────────────────────────┐
│ 📄 Birth Certificate.pdf                    │
├──────────────────────────────────────────────┤
│ Detected Language: French                    │
│ Document Type: Birth Certificate             │
│ Pages: 1                                     │
│ Complexity: Low                              │
│ AI Analysis: ✓ Completed                    │
└──────────────────────────────────────────────┘
```

**Data Displayed**:

- File name: `file.name`
- Detected language: `file.detectedLanguage`
- Document type: `file.detectedDocumentType`
- Page count: `file.pageCount`
- Complexity: `file.complexity`
- Analysis status: `file.analysisStatus`

**If No Files**:

- Display: "No files uploaded"
- Note: "Manual entry will be required"

**Actions**:

- "Edit" button → Go back to Step 3
- "Re-analyze" button (if AI failed)

---

### Section 4: Detailed Pricing Breakdown

**Data Source**: From Step 4 (`QuotePricing`)

**Per-File Pricing Table**:

```
┌──────────────────────────────────────────────────────────┐
│ Document Pricing                                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 1. Birth Certificate.pdf                                │
│    Translation (1 page × $65 × 1.0 × 1.0):    $65.00   │
│    Certification (Standard):                   $25.00   │
│    ─────────────────────────────────────────────────    │
│    Subtotal:                                   $90.00   │
│                                                          │
│ 2. Diploma.pdf                                          │
│    Translation (2 pages × $65 × 1.0 × 1.15):  $149.50  │
│    Certification (Notarized):                  $45.00   │
│    ─────────────────────────────────────────────────    │
│    Subtotal:                                  $194.50   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Documents Total:                              $284.50   │
└──────────────────────────────────────────────────────────┘
```

**Quote-Level Summary**:

```
┌──────────────────────────────────────────────────────────┐
│ Quote Summary                                            │
├──────────────────────────────────────────────────────────┤
│ Documents Subtotal (2 files):                 $284.50   │
│ Rush Service (30%):                           +$85.35   │
│ Delivery (Express Shipping):                  +$35.00   │
│ Discount (Loyal Customer):                    -$20.00   │
│ ─────────────────────────────────────────────────────    │
│ Pre-tax Total:                                $384.85   │
│ GST (5%):                                     +$19.24   │
│ ─────────────────────────────────────────────────────    │
│ TOTAL:                                        $404.09   │
└──────────────────────────────────────────────────────────┘
```

**Actions**:

- "Edit Pricing" button → Go back to Step 4

---

### Section 5: Internal Notes

**Field**: Textarea (editable)

- **Name**: `staffNotes`
- **Placeholder**: "Internal notes about this quote (not visible to customer)..."
- **Max Length**: 2000 characters
- **Purpose**: Staff comments, special handling instructions
- **Storage**: `quotes.manual_quote_notes`

---

### Section 6: Quote Creation Options

**Entry Point** (Auto-selected, hidden):

- Field: Dropdown
- Options: staff_manual, staff_phone, staff_walkin, staff_email
- Default: staff_manual
- Storage: `quotes.entry_point`

**Notification Preference**:

- Field: Radio buttons
- Options:
  - "Send quote immediately" → Email quote to customer
  - "Save as draft" → Don't send, just save
- Default: "Save as draft"
- Purpose: Control whether customer gets notified

---

### Action Buttons:

**1. "Create Quote" (Primary Action)**

**Triggers**:

1. Validate all data
2. Create/update customer record
3. Update quote record with all data
4. Store file pricing in `ai_analysis_results` table
5. Store adjustments in `quote_adjustments` table
6. Update quote status
7. Optionally send email
8. Navigate to quote detail page

**Edge Function**: `create-staff-quote` or update existing quote

**API Call**:

```typescript
const response = await fetch("/functions/v1/create-staff-quote", {
  method: "POST",
  body: JSON.stringify({
    staffId: session.staffId,

    // Customer
    customerData: {
      id: customer.id,
      email: customer.email,
      fullName: customer.fullName,
      phone: customer.phone,
      customerType: customer.customerType,
      companyName: customer.companyName,
    },

    // Quote details
    quoteData: {
      sourceLanguageId: quote.sourceLanguageId,
      targetLanguageId: quote.targetLanguageId,
      intendedUseId: quote.intendedUseId,
      countryOfIssue: quote.countryOfIssue,
      specialInstructions: quote.specialInstructions,
    },

    // Files (already uploaded)
    fileIds: files.map((f) => f.uploadedFileId),

    // Pricing
    pricing: {
      filePrices: pricing.filePrices,
      documentSubtotal: pricing.documentSubtotal,
      isRush: pricing.isRush,
      rushFee: pricing.rushFee,
      deliveryOptionId: pricing.deliveryOptionId,
      deliveryFee: pricing.deliveryFee,
      discountAmount: pricing.discountAmount,
      discountReason: pricing.discountReason,
      surchargeAmount: pricing.surchargeAmount,
      surchargeReason: pricing.surchargeReason,
      preTaxTotal: pricing.preTaxTotal,
      taxRate: pricing.taxRate,
      taxAmount: pricing.taxAmount,
      total: pricing.total,
    },

    // Meta
    entryPoint: "staff_manual",
    staffNotes: staffNotes,
    sendNotification: notificationPreference === "send",
  }),
});
```

**On Success**:

```typescript
// Response
{
  success: true,
  quoteId: "uuid",
  quoteNumber: "QT-20260129-0001"
}

// Actions
toast.success("Quote created successfully!");
navigate(`/admin/quotes/${quoteId}`);
```

**On Error**:

```typescript
// Response
{
  success: false,
  error: "Error message"
}

// Actions
toast.error("Failed to create quote");
// Stay on page, allow retry
```

**2. "Save as Draft" (Secondary Action)**

- Same as "Create Quote" but sets status to 'draft'
- No email sent
- Can be edited later

**3. "Cancel" (Tertiary Action)**

- Confirm dialog: "Are you sure? All progress will be lost."
- Navigate to `/admin/quotes`

---

### Database Updates on Final Submission:

**1. `customers` table** (if new customer):

```sql
INSERT INTO customers (
  email, full_name, phone,
  customer_type, company_name,
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
RETURNING id
```

**2. `quotes` table** (update existing draft):

```sql
UPDATE quotes SET
  customer_id = ?,
  source_language_id = ?,
  target_language_id = ?,
  intended_use_id = ?,
  country_of_issue = ?,
  special_instructions = ?,

  subtotal = ?,
  certification_total = ?,
  rush_fee = ?,
  delivery_fee = ?,
  tax_rate = ?,
  tax_amount = ?,
  total = ?,

  is_rush = ?,
  delivery_option_id = ?,

  status = 'quote_ready',
  entry_point = ?,
  manual_quote_notes = ?,

  created_by_staff_id = ?,
  is_manual_quote = true,

  updated_at = NOW()
WHERE id = ?
```

**3. `ai_analysis_results` table** (per file):

```sql
UPDATE ai_analysis_results SET
  detected_language = ?,
  detected_document_type = ?,
  page_count = ?,
  billable_pages = ?,
  assessed_complexity = ?,
  complexity_multiplier = ?,

  base_rate = ?,
  line_total = ?,

  certification_type_id = ?,
  certification_price = ?,

  updated_at = NOW()
WHERE quote_file_id = ?
```

**4. `quote_adjustments` table** (if discount/surcharge):

```sql
INSERT INTO quote_adjustments (
  quote_id,
  adjustment_type,  -- 'discount' or 'surcharge'
  value_type,       -- 'fixed' or 'percentage'
  value,
  calculated_amount,
  reason,
  created_by_staff_id,
  created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
```

**5. `staff_activity_log` table**:

```sql
INSERT INTO staff_activity_log (
  staff_id,
  action_type,
  entity_type,
  entity_id,
  details,
  created_at
) VALUES (
  ?,
  'create_manual_quote',
  'quote',
  ?,
  ?::jsonb,
  NOW()
)
```

---

## Summary

### Step 4 Key Features:

- ✅ Per-file editable pricing
- ✅ Real-time calculation updates
- ✅ Quote-level adjustments (rush, delivery, discount, surcharge)
- ✅ Tax calculation
- ✅ Comprehensive price breakdown

### Step 5 Key Features:

- ✅ Complete quote review
- ✅ Edit buttons for each section
- ✅ Detailed pricing display
- ✅ Staff notes field
- ✅ Final submission with validation
- ✅ Database persistence
- ✅ Optional email notification

### Database Tables Used:

1. customers
2. quotes
3. quote_files
4. ai_analysis_results
5. languages
6. intended_uses
7. document_types
8. certification_types
9. delivery_options
10. tax_rates
11. quote_adjustments
12. staff_activity_log

This plan provides complete field-level detail for implementation!
