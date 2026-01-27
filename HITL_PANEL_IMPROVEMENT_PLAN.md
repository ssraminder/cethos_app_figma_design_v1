# Admin HITL Panel Redesign Plan

## Executive Summary

Redesign the HITLReviewDetail page to provide staff with comprehensive visibility into customer data, document information, and quote details (Steps 2 & 3) while maintaining efficient access to messaging and document analysis tools.

---

## Current State Analysis

### Issues

- **Messaging dominates**: Message panel takes up most vertical space, relegating document analysis below the fold
- **Limited context visibility**: Staff cannot see:
  - Customer contact information (email, phone)
  - Document file names and metadata
  - Translation requirements (language pairs, purpose, target country)
  - Customer notes and special instructions
  - Service location (province)
- **Information scattered**: No cohesive view of the quote lifecycle
- **Poor workflow**: Staff must scroll extensively to see all relevant information

### Current Components

- Header: Basic review info + claim button
- Main content: Document list with AI analysis (complex accordion structure)
- Bottom section: Message panel (isolated at bottom)

---

## Proposed New Layout

### Layout Architecture: 3-Column Responsive Grid

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HEADER (Full Width)                         │
│  Review Controls | Claim Status | Action Buttons | Document Tabs   │
├────────────────┬──────────────────────────┬──────────────────────┤
│                │                          │                      │
│   LEFT PANEL   │     CENTER PANEL         │   RIGHT PANEL        │
│  (20-25%)      │    (50-55%)              │   (20-25%)          │
│                │                          │                      │
│  • Customer    │ • AI Analysis Results    │ • Messaging Panel    │
│    Info        │ • Document Details      │ • Message Threads    │
│  • File Info   │ • Page-by-Page Review   │ • Internal Notes     │
│  • Step 2-3    │ • Correction Interface  │ • Quick Actions      │
│    Data        │                          │                      │
│                │                          │                      │
└────────────────┴──────────────────────────┴──────────────────────┘
```

### Responsive Behavior

- **Desktop (1400px+)**: 3-column layout as above
- **Tablet (768px - 1400px)**: Stacked vertically or 2-column with messaging in collapsible panel
- **Mobile (<768px)**: Tab-based navigation between panels

---

## Component Breakdown

### Left Panel Components

#### 1. **CustomerInfoPanel** (New)

```
├─ Customer Header
│  ├─ Full Name
│  ├─ Email (clickable)
│  ├─ Phone (clickable)
│  └─ Customer Type (Individual/Business)
├─ Customer Actions
│  ├─ Send Email button
│  ├─ Call button
│  └─ View All Quotes link
└─ Quote Summary
   ├─ Quote Number
   ├─ Quote Total
   ├─ Status badge
   └─ Created Date
```

#### 2. **DocumentFilesPanel** (New)

```
├─ File List
│  ├─ File Item (repeating)
│  │  ├─ File name
│  │  ├─ File size
│  │  ├─ Upload date
│  │  ├─ Processing status
│  │  └─ Download button
│  └─ Total files count
└─ File Statistics
   ├─ Total pages
   ├─ Total words
   └─ File size sum
```

#### 3. **QuoteDetailsPanel** (New) - Steps 2 & 3 Data

```
├─ Translation Requirements (Step 2)
│  ├─ Source Language
│  ├─ Target Language
│  ├─ Purpose of Translation
│  ├─ Country of Issue
│  ├─ Service Province (if applicable)
│  └─ Special Instructions
├─ Contact Information (Step 3)
│  ├─ Full Name (validated)
│  ├─ Email (validated)
│  ├─ Phone (validated)
│  ├─ Customer Type
│  └─ Company Name (if business)
└─ Pricing Information
   ├─ Base rate
   ├─ Language multiplier
   ├─ Complexity multiplier
   └─ Estimated total
```

### Center Panel Components

#### 1. **DocumentAnalysisPanel** (Existing, Improved)

```
├─ Document Tab Navigation
│  ├─ Tab: Document Name
│  ├─ Tab: Document Name
│  └─ (repeating for each file)
├─ Current Document View
│  ├─ File Metadata
│  │  ├─ Original name
│  │  ├─ Storage path
│  │  ├─ File size
│  │  └─ MIME type
│  ├─ AI Analysis Results
│  │  ├─ Detected Language
│  │  ├─ Document Type
│  │  ├─ Complexity Level
│  │  ├─ Word Count
│  │  ├─ Page Count
│  │  └─ Confidence scores
│  ├─ Page-by-Page Details
│  │  └─ (Collapsible accordion per page)
│  └─ Correction Interface
│     ├─ Edit Fields
│     ├─ Add Certifications
│     └─ Page Splitting/Combining
└─ Document Toolbar
   ├─ Preview button
   ├─ Download button
   └─ Mark as reviewed
```

### Right Panel Components

#### 1. **MessagingPanel** (Refactored)

```
├─ Message Thread Header
│  ├─ Contact name
│  └─ Last activity timestamp
├─ Message List (Scrollable)
│  ├─ Message Item (repeating)
│  │  ├─ Sender avatar/initials
│  │  ├─ Sender name
│  │  ├─ Timestamp
│  │  ├─ Message content
│  │  └─ Read status indicator
│  └─ Unread message divider
├─ Message Input
│  ├─ Rich text editor
│  ├─ Attachment button
│  └─ Send button
└─ Quick Actions
   ├─ Request more info button
   ├─ Mark ready button
   ├─ Reject with reason button
   └─ Share document link button
```

#### 2. **InternalNotesPanel** (New)

```
├─ Internal Notes Textarea
├─ Note History (collapsible)
│  ├─ Note by Staff Name
│  ├─ Timestamp
│  ├─ Note content
│  └─ Edit/Delete options
└─ Save Internal Note button
```

---

## Data Mapping

### From Quote Record (Existing)

```typescript
interface Quote {
  id: string;
  quote_number: string;
  status: string;

  // Step 2 Data
  source_language_id: string;
  target_language_id: string;
  intended_use_id: string;
  country_id: string;
  service_province?: string;
  special_instructions?: string;

  // Step 3 Data (via customer_id)
  customer_id: string;

  // Pricing
  subtotal: number;
  certification_total: number;
  tax_amount: number;
  total: number;

  // Timestamps
  created_at: string;
  updated_at: string;
}
```

### From Customer Record (Related)

```typescript
interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  customer_type: "individual" | "business";
  company_name?: string;
}
```

### From Quote Files (Related)

```typescript
interface QuoteFile {
  id: string;
  quote_id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  upload_status: string;
  processing_status: string;
  created_at: string;
}
```

### From Analysis Results (Existing)

```typescript
interface AnalysisResult {
  id: string;
  quote_file_id: string;
  detected_language: string;
  detected_document_type: string;
  assessed_complexity: string;
  complexity_multiplier: number;
  word_count: number;
  page_count: number;
  certification_type_id: string;
  certification_price: number;
  // ... more fields
}
```

---

## Messaging Strategy

### Messaging Improvements

#### 1. **Reduced Visual Footprint**

- Move from full-width section to fixed-width right panel
- Limit height to ~500-600px with scrollable message list
- Messages auto-scroll to latest when new message arrives

#### 2. **Message Types**

- **Customer Messages**: Blue background, left-aligned
- **Staff Messages**: Gray background, right-aligned
- **System Messages**: Italic, centered (e.g., "Review claimed by John")
- **Internal Notes**: Separate from messages (shown in collapsible section)

#### 3. **Quick Actions in Messaging Panel**

Instead of separate buttons scattered around, integrate action buttons in the messaging panel:

- "Request More Info" → Pre-fill message template
- "Ready for Quote" → Show price summary before confirmation
- "Reject" → Open reason modal with message notification
- "Share Document" → Generate secure link and send

#### 4. **Real-time Updates**

- WebSocket or polling for new messages
- Unread message indicator with count badge
- Sound/visual notification for new messages

#### 5. **Message Persistence**

- Internal notes separated from customer-facing messages
- Audit trail of who made corrections and when
- Link corrections to specific messages

---

## Implementation Phases

### Phase 1: Component Creation (Week 1)

- Create `CustomerInfoPanel.tsx`
- Create `DocumentFilesPanel.tsx`
- Create `QuoteDetailsPanel.tsx` (shows Step 2 & 3 data)
- Create `InternalNotesPanel.tsx`
- Create `DocumentAnalysisPanel.tsx` (refactored from existing)

**Files to Create:**

```
code/client/components/admin/hitl/
├─ CustomerInfoPanel.tsx
├─ DocumentFilesPanel.tsx
├─ QuoteDetailsPanel.tsx
├─ InternalNotesPanel.tsx
├─ DocumentAnalysisPanel.tsx
└─ HITLPanelLayout.tsx (layout container)
```

### Phase 2: Layout Restructuring (Week 1-2)

- Refactor `HITLReviewDetail.tsx` to use 3-column grid layout
- Implement responsive breakpoints for tablet/mobile
- Integrate all new panels into main layout
- Update styling with Tailwind grid/flex utilities

### Phase 3: Data Fetching Optimization (Week 2)

- Add customer data fetch to `fetchReviewData()`
- Add quote details fetch (language lookups, etc.)
- Add file metadata to display
- Optimize SQL queries to avoid N+1 problems
- Add error states for missing data

### Phase 4: Messaging Refactor (Week 2-3)

- Update `MessagePanel` component:
  - Reduce height to 500px max
  - Add unread indicator
  - Implement quick action buttons
  - Improve mobile responsiveness
- Add `InternalNotesPanel` with separate UI
- Create message type constants

### Phase 5: Polish & Testing (Week 3-4)

- Responsive design testing (desktop, tablet, mobile)
- Accessibility audit (ARIA labels, keyboard navigation)
- Performance optimization (lazy load panels if needed)
- User acceptance testing with admin staff
- Documentation updates

---

## Technical Implementation Details

### API Changes Needed

```typescript
// Enhanced review data fetch
GET /rest/v1/v_hitl_queue?review_id=eq.{id}&select=*,quotes(*),customers(*)

// Or use direct queries for better control:
// 1. Fetch review
GET /rest/v1/v_hitl_queue?review_id=eq.{id}

// 2. Fetch quote with related data
GET /rest/v1/quotes?id=eq.{quote_id}&select=*

// 3. Fetch customer
GET /rest/v1/customers?id=eq.{customer_id}&select=*

// 4. Fetch quote files
GET /rest/v1/quote_files?quote_id=eq.{quote_id}&select=*

// 5. Fetch language/use/country names for display
// (Already done in existing code)
```

### State Management Updates

```typescript
// Existing state
const [reviewData, setReviewData] = useState<any>(null);
const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

// New state to add
const [quoteData, setQuoteData] = useState<Quote | null>(null);
const [customerData, setCustomerData] = useState<Customer | null>(null);
const [quoteFiles, setQuoteFiles] = useState<QuoteFile[]>([]);
const [internalNotes, setInternalNotes] = useState<string>("");
const [showInternalNotes, setShowInternalNotes] = useState<boolean>(false);
```

### Styling Approach

```tsx
// Main layout grid
<div className="grid grid-cols-12 gap-4 h-full">
  {/* Left Panel: 3 columns */}
  <aside className="col-span-3 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
    <CustomerInfoPanel />
    <DocumentFilesPanel />
    <QuoteDetailsPanel />
  </aside>

  {/* Center Panel: 6 columns */}
  <main className="col-span-6 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
    <DocumentAnalysisPanel />
  </main>

  {/* Right Panel: 3 columns */}
  <aside className="col-span-3 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
    <MessagingPanel />
    <InternalNotesPanel />
  </aside>
</div>

// Responsive overrides
@media (max-width: 1024px) {
  .col-span-3 { @apply col-span-4; }
  .col-span-6 { @apply col-span-4; }
}

@media (max-width: 768px) {
  // Use tabs or collapsed accordion instead of 3-column
}
```

---

## Benefits

### For Staff

- **Single View**: All relevant information visible without scrolling (on desktop)
- **Better Context**: Understand customer needs and special requirements
- **Faster Review**: Fewer clicks to access different information types
- **Cleaner Interface**: Separated concerns (analysis, messaging, notes)

### For System

- **Better UX**: Reduced cognitive load with organized information
- **Improved Efficiency**: Staff can handle more reviews per hour
- **Fewer Errors**: Full context reduces correction mistakes
- **Better Audit Trail**: Clear separation of corrections vs. messages vs. internal notes

---

## Migration Path

### Step 1: Add New Components

Create new panel components alongside existing code without removing anything.

### Step 2: Update Layout Gradually

Replace the bottom message panel section with new 3-column layout, keeping all existing logic intact.

### Step 3: Test Thoroughly

Have staff test new layout with actual reviews before full rollout.

### Step 4: Retire Old Components

Remove old layout code once new version is stable and staff trained.

---

## Success Metrics

- Average time to complete review: **-20%** reduction
- Staff satisfaction with HITL panel: **+30%** improvement
- Number of corrections needed on finalized reviews: **-15%** reduction
- Training time for new staff: **-25%** reduction
