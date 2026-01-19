# Supabase Database Schema

This document describes the database schema required for the CETHOS quote wizard.

## Setup Instructions

1. Create a new Supabase project at https://supabase.com
2. Copy your project URL and anon key
3. Add them to your `.env` file:
   ```
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
4. Run the SQL commands below in the Supabase SQL Editor

## Tables

### 1. quotes

Main table for storing translation quote requests.

```sql
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'details_pending', 'quote_ready', 'awaiting_payment', 'paid', 'in_progress', 'completed')),
  customer_id UUID REFERENCES customers(id),
  source_language_id TEXT,
  target_language_id TEXT,
  intended_use_id TEXT,
  country_of_issue TEXT,
  special_instructions TEXT,
  subtotal DECIMAL(10,2),
  certification_total DECIMAL(10,2),
  tax_rate DECIMAL(5,4),
  tax_amount DECIMAL(10,2),
  total DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on quote_number for fast lookups
CREATE INDEX idx_quotes_quote_number ON quotes(quote_number);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_customer_id ON quotes(customer_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_quotes_updated_at
BEFORE UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### 2. customers

Stores customer information.

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  customer_type TEXT NOT NULL CHECK (customer_type IN ('individual', 'business')),
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for fast lookups
CREATE INDEX idx_customers_email ON customers(email);

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### 3. quote_files

Tracks uploaded files for each quote.

```sql
CREATE TABLE quote_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  upload_status TEXT NOT NULL CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on quote_id for fast lookups
CREATE INDEX idx_quote_files_quote_id ON quote_files(quote_id);
```

### 4. languages (Optional - for future use)

Reference table for supported languages.

```sql
CREATE TABLE languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert common languages
INSERT INTO languages (name, code) VALUES
  ('English', 'en'),
  ('Spanish', 'es'),
  ('French', 'fr'),
  ('German', 'de'),
  ('Chinese', 'zh'),
  ('Japanese', 'ja'),
  ('Arabic', 'ar'),
  ('Portuguese', 'pt'),
  ('Russian', 'ru'),
  ('Italian', 'it');
```

### 5. intended_uses (Optional - for future use)

Reference table for translation purposes.

```sql
CREATE TABLE intended_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert common use cases
INSERT INTO intended_uses (name, description) VALUES
  ('Immigration', 'Documents for immigration or visa applications'),
  ('Academic', 'Educational transcripts and certificates'),
  ('Legal', 'Legal documents and court filings'),
  ('Business', 'Corporate and business documents'),
  ('Personal', 'Personal documents and records'),
  ('Medical', 'Medical records and reports');
```

## Storage Buckets

### quote-files

Create a storage bucket for uploaded documents:

1. Go to Storage in Supabase dashboard
2. Create a new bucket called `quote-files`
3. Set it to **private** (not public)
4. Configure policies:

```sql
-- Allow authenticated uploads
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quote-files');

-- Allow authenticated reads
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'quote-files');

-- For public access (anon key), use these policies instead:
CREATE POLICY "Allow anon uploads"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'quote-files');

CREATE POLICY "Allow anon reads"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'quote-files');
```

## Row Level Security (RLS)

Enable RLS on all tables for security:

```sql
-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_files ENABLE ROW LEVEL SECURITY;

-- Policies for public access (Phase 1)
-- Note: In production, you'd want stricter policies based on user authentication

-- Allow all operations on quotes (Phase 1 - no auth)
CREATE POLICY "Allow all operations on quotes"
ON quotes FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Allow all operations on customers (Phase 1 - no auth)
CREATE POLICY "Allow all operations on customers"
ON customers FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Allow all operations on quote_files (Phase 1 - no auth)
CREATE POLICY "Allow all operations on quote_files"
ON quote_files FOR ALL
TO anon
USING (true)
WITH CHECK (true);
```

## Testing the Setup

After running all the SQL commands above, test your setup:

1. Upload a test file through the quote wizard
2. Check the Supabase Table Editor to see if records are created
3. Check the Storage browser to see if files are uploaded
4. Monitor the Supabase logs for any errors

## Environment Variables

Make sure these are set in your `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Next Steps

For Phase 2, consider adding:

- User authentication with Supabase Auth
- Stricter RLS policies based on user roles
- File size limits and validation
- Email notifications via Supabase Edge Functions
- Payment processing integration
