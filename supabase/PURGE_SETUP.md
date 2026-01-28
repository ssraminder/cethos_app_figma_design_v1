# Draft Quote Purge Setup Guide

This system automatically deletes old draft and incomplete quotes to keep the database clean.

## What Gets Purged?

- **Quotes** with status `draft` or `details_pending`
- **Age**: Older than 14 days (2 weeks)
- **Related data**: Quote files, AI analysis results
- **Excluded**: Soft-deleted quotes (already marked with `deleted_at`)

## Components

### 1. Database Function

**File**: `code/supabase/migrations/20260128_purge_old_draft_quotes.sql`

PostgreSQL function that performs the actual deletion:

```sql
SELECT * FROM purge_old_draft_quotes();
```

Returns:

- `deleted_count`: Number of quotes purged
- `purge_date`: When the purge ran
- `details`: JSON with breakdown (quotes, files, analysis records)

### 2. Edge Function

**File**: `code/supabase/functions/purge-draft-quotes/index.ts`

Supabase Edge Function that calls the database function. Protected by optional CRON_SECRET.

**URL**: `https://[your-project].supabase.co/functions/v1/purge-draft-quotes`

### 3. GitHub Actions Workflow

**File**: `.github/workflows/purge-draft-quotes.yml`

Scheduled job that runs daily at 2 AM UTC.

## Setup Instructions

### Step 1: Deploy the Database Function

Option A - Using Supabase Dashboard:

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `code/supabase/migrations/20260128_purge_old_draft_quotes.sql`
3. Run the migration
4. Verify: `SELECT * FROM purge_old_draft_quotes();`

Option B - Using Supabase CLI:

```bash
cd code
supabase db push
```

### Step 2: Deploy the Edge Function

```bash
cd code
supabase functions deploy purge-draft-quotes --no-verify-jwt
```

### Step 3: Set Environment Variable (Optional but Recommended)

In Supabase Dashboard → Settings → Edge Functions → Secrets:

```
CRON_SECRET=your-random-secure-token-here
```

Generate a secure token:

```bash
openssl rand -base64 32
```

### Step 4: Configure GitHub Secrets

In your GitHub repository → Settings → Secrets and variables → Actions:

Add these secrets:

- `SUPABASE_URL`: Your Supabase project URL (e.g., `https://abcdefg.supabase.co`)
- `CRON_SECRET`: Same token you set in Step 3

### Step 5: Enable GitHub Actions

1. Push the workflow file to your repository
2. Go to GitHub → Actions tab
3. Enable workflows if prompted
4. The purge will run daily at 2 AM UTC

## Manual Testing

### Test the database function directly:

```sql
-- See what would be deleted without actually deleting
SELECT
  id,
  quote_number,
  status,
  created_at,
  AGE(NOW(), created_at) as age
FROM quotes
WHERE status IN ('draft', 'details_pending')
  AND created_at < NOW() - INTERVAL '14 days'
  AND deleted_at IS NULL;

-- Run the purge
SELECT * FROM purge_old_draft_quotes();
```

### Test the edge function:

```bash
curl -X POST \
  "https://[your-project].supabase.co/functions/v1/purge-draft-quotes" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Trigger GitHub Action manually:

1. Go to GitHub → Actions → "Purge Old Draft Quotes"
2. Click "Run workflow"
3. Check the logs

## Monitoring

### View purge logs:

```sql
SELECT
  action,
  details,
  created_at
FROM staff_activity_log
WHERE action = 'auto_purge_draft_quotes'
ORDER BY created_at DESC
LIMIT 10;
```

### Check last purge:

```sql
SELECT
  (details->>'quotes_deleted')::int as quotes_deleted,
  (details->>'files_deleted')::int as files_deleted,
  (details->>'analysis_deleted')::int as analysis_deleted,
  created_at
FROM staff_activity_log
WHERE action = 'auto_purge_draft_quotes'
ORDER BY created_at DESC
LIMIT 1;
```

## Adjusting the Schedule

### Change retention period:

Edit the migration file line:

```sql
v_cutoff_date := NOW() - INTERVAL '14 days'; -- Change to '7 days', '30 days', etc.
```

### Change cron schedule:

Edit `.github/workflows/purge-draft-quotes.yml`:

```yaml
schedule:
  - cron: "0 2 * * *" # Daily at 2 AM UTC
  # Examples:
  # - cron: '0 */12 * * *'  # Every 12 hours
  # - cron: '0 0 * * 0'     # Weekly on Sunday
  # - cron: '0 3 * * 1-5'   # Weekdays at 3 AM
```

## Alternative: Using External Cron Service

If you prefer not to use GitHub Actions:

1. Sign up for [cron-job.org](https://cron-job.org) or similar
2. Create a new cron job:
   - URL: `https://[your-project].supabase.co/functions/v1/purge-draft-quotes`
   - Method: POST
   - Headers:
     - `Authorization: Bearer YOUR_CRON_SECRET`
     - `Content-Type: application/json`
   - Schedule: Daily at 2 AM

## Troubleshooting

### Purge not running?

- Check GitHub Actions logs
- Verify CRON_SECRET matches in both Supabase and GitHub
- Ensure edge function is deployed: `supabase functions list`

### Permission errors?

- Verify the function has `GRANT EXECUTE` permissions
- Check service_role key is set correctly

### Nothing being deleted?

- Verify quotes exist:
  ```sql
  SELECT COUNT(*) FROM quotes
  WHERE status IN ('draft', 'details_pending')
  AND created_at < NOW() - INTERVAL '14 days';
  ```
- Check if quotes are already soft-deleted (`deleted_at IS NOT NULL`)

## Security Notes

- The CRON_SECRET prevents unauthorized purge triggers
- Function uses SECURITY DEFINER to run with elevated privileges
- All purge operations are logged in `staff_activity_log`
- Soft-deleted quotes are NOT purged (preserves audit trail)
