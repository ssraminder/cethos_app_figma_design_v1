# Supabase Integration Guide

## Overview

The CETHOS quote wizard now integrates with Supabase for backend data persistence, file storage, and database management.

## Features Implemented

### ✅ Step 1: File Upload & Quote Creation
- Files are uploaded to Supabase Storage bucket `quote-files`
- Quote record created in `quotes` table with status: "draft"
- Each file tracked in `quote_files` table
- Automatic quote number generation (QT-2026-XXXXX)

### ✅ Step 2: Translation Details
- Quote updated with language preferences
- Intended use and country of issue saved
- Status updated to "details_pending"

### ✅ Step 3: Review
- No database operations (review only)
- Data pulled from context state

### ✅ Step 4: Contact Information
- Customer created/updated in `customers` table
- Quote linked to customer via `customer_id`
- Status updated to "quote_ready"

### ✅ Step 5: Finalize Quote
- Pricing calculated and saved:
  - Subtotal: $65 per file
  - Certification: $50 per file
  - Tax: 5% of subtotal
- Status updated to "awaiting_payment"

## Architecture

### File Structure

```
client/
├── lib/
│   └── supabase.ts          # Supabase client & TypeScript types
├── hooks/
│   └── useSupabase.ts       # Database operations hook
├── context/
│   └── QuoteContext.tsx     # Global state with Supabase integration
└── pages/
    ├── Index.tsx            # Step 1: File upload
    ├── Details.tsx          # Step 2: Translation details
    ├── Review.tsx           # Step 3: Quote review
    ├── Contact.tsx          # Step 4: Contact info
    └── Success.tsx          # Step 5: Confirmation
```

### Data Flow

```
User Action → QuoteContext → useSupabase Hook → Supabase API
                    ↓
            localStorage (backup)
```

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for database to initialize

### 2. Configure Environment Variables

Update `.env` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Set Up Database

Run the SQL commands in `SUPABASE_SCHEMA.md` via Supabase SQL Editor:

1. Open your Supabase project dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Copy and paste the schema from `SUPABASE_SCHEMA.md`
5. Execute the query

### 4. Create Storage Bucket

1. Go to Storage in Supabase dashboard
2. Create bucket named `quote-files`
3. Set to **private**
4. Apply the storage policies from `SUPABASE_SCHEMA.md`

### 5. Restart Dev Server

```bash
pnpm dev
```

## Error Handling

The integration includes robust error handling:

### Toast Notifications
- ✅ Success messages for completed operations
- ⚠️ Warnings for partial failures
- ❌ Error messages with retry options

### Graceful Degradation
- If Supabase is unavailable, the app continues to work using localStorage
- Navigation is never blocked by database errors
- Failed file uploads can be retried

### Retry Logic
- Files that fail to upload are queued for retry
- Use `retryFileUpload()` function to retry individual files

## Testing

### Manual Testing Steps

1. **Upload Files (Step 1)**
   - Upload 2-3 test PDF files
   - Click "Continue"
   - ✅ Check: Quote record created in Supabase
   - ✅ Check: Files appear in Storage bucket

2. **Add Details (Step 2)**
   - Select source and target languages
   - Choose purpose and country
   - Click "Continue"
   - ✅ Check: Quote updated with details

3. **Review Quote (Step 3)**
   - Verify pricing calculations
   - Click "Continue"

4. **Enter Contact Info (Step 4)**
   - Fill in name, email, phone
   - Click "Continue"
   - ✅ Check: Customer record created
   - ✅ Check: Quote linked to customer

5. **Confirm Quote (Step 5)**
   - Copy quote number
   - ✅ Check: Quote status = "awaiting_payment"
   - ✅ Check: Pricing fields populated

### Verify in Supabase Dashboard

**Table Editor:**
- `quotes` table should have 1 row
- `customers` table should have 1 row
- `quote_files` table should have rows for each file

**Storage:**
- `quote-files` bucket should contain uploaded files
- Files organized by quote ID: `{quote_id}/{filename}`

## API Reference

### useSupabase Hook

```typescript
const {
  loading,
  error,
  createQuoteWithFiles,
  updateQuoteDetails,
  createOrUpdateCustomer,
  finalizeQuote,
  retryFileUpload,
} = useSupabase();
```

#### Methods

**createQuoteWithFiles(files: UploadedFile[])**
- Creates quote record and uploads files
- Returns: `{ quoteId, quoteNumber }` or `null`

**updateQuoteDetails(quoteId, details)**
- Updates quote with translation preferences
- Returns: `boolean` (success/failure)

**createOrUpdateCustomer(quoteId, customerData)**
- Creates new customer or updates existing
- Links customer to quote
- Returns: `boolean`

**finalizeQuote(quoteId, fileCount)**
- Calculates and saves pricing
- Updates status to "awaiting_payment"
- Returns: `boolean`

**retryFileUpload(quoteId, file)**
- Retries failed file upload
- Updates file status to "uploaded"
- Returns: `boolean`

## Database Schema

### quotes Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| quote_number | TEXT | Unique quote number (QT-2026-XXXXX) |
| status | TEXT | Current quote status |
| customer_id | UUID | Foreign key to customers |
| source_language_id | TEXT | Source language |
| target_language_id | TEXT | Target language |
| intended_use_id | TEXT | Purpose of translation |
| country_of_issue | TEXT | Document country |
| special_instructions | TEXT | Additional notes |
| subtotal | DECIMAL | Translation subtotal |
| certification_total | DECIMAL | Certification fees |
| tax_rate | DECIMAL | Tax percentage |
| tax_amount | DECIMAL | Calculated tax |
| total | DECIMAL | Final total |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

### customers Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | Customer email (unique) |
| full_name | TEXT | Full name |
| phone | TEXT | Phone number |
| customer_type | TEXT | 'individual' or 'business' |
| company_name | TEXT | Company name (if business) |

### quote_files Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| quote_id | UUID | Foreign key to quotes |
| original_filename | TEXT | Original file name |
| storage_path | TEXT | Path in storage bucket |
| file_size | BIGINT | File size in bytes |
| mime_type | TEXT | File MIME type |
| upload_status | TEXT | 'pending', 'uploaded', or 'failed' |

## Troubleshooting

### Files Not Uploading

**Symptom:** Files don't appear in Storage
**Solution:**
1. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
2. Verify storage bucket exists and is named `quote-files`
3. Check storage policies are applied
4. Look for errors in browser console

### Database Errors

**Symptom:** Toast error messages appear
**Solution:**
1. Verify tables exist in Supabase
2. Check RLS policies are configured
3. Ensure anon key has proper permissions
4. Check browser console for detailed errors

### Environment Variables Not Loading

**Symptom:** Console warning about missing Supabase credentials
**Solution:**
1. Ensure `.env` file exists in project root
2. Variables must start with `VITE_` for Vite to expose them
3. Restart dev server after changing `.env`

## Security Considerations

### Current Setup (Phase 1)
- Uses Supabase anon key
- Public access to all tables
- No user authentication

### Recommended for Production (Phase 2)
- Implement Supabase Auth
- Add RLS policies based on user ID
- Use service role key for admin operations
- Add file type and size validation
- Implement rate limiting

## Next Steps

1. **User Authentication**
   - Add Supabase Auth for user login
   - Associate quotes with authenticated users
   - Implement user dashboard

2. **Enhanced Security**
   - Stricter RLS policies
   - File validation (type, size, malware scan)
   - API rate limiting

3. **Email Notifications**
   - Send quote confirmation emails
   - Quote status update emails
   - Use Supabase Edge Functions

4. **Payment Integration**
   - Stripe/PayPal integration
   - Order confirmation workflow
   - Receipt generation

5. **Admin Dashboard**
   - Quote management interface
   - Customer management
   - File download and review
