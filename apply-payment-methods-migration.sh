#!/bin/bash
# Script to apply payment_methods migration to Supabase database

echo "Applying payment_methods and adjustments migration..."

# Read the Supabase connection details from .env
source .env 2>/dev/null || true

SUPABASE_URL="${VITE_SUPABASE_URL:-https://lmzoyezvsjgsxveoakdr.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY not found in environment"
  echo "Please set your Supabase service role key:"
  echo "export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key-here'"
  exit 1
fi

# Apply the migration using psql or Supabase CLI
# You can also use the Supabase dashboard SQL editor to run this migration

echo "Migration file: supabase/migrations/20260129_payment_methods_and_adjustments.sql"
echo ""
echo "To apply this migration, you have two options:"
echo ""
echo "Option 1: Use Supabase Dashboard"
echo "  1. Go to https://supabase.com/dashboard/project/lmzoyezvsjgsxveoakdr/sql"
echo "  2. Copy the contents of: supabase/migrations/20260129_payment_methods_and_adjustments.sql"
echo "  3. Paste into the SQL Editor"
echo "  4. Click 'Run'"
echo ""
echo "Option 2: Use Supabase CLI"
echo "  npx supabase db push"
echo ""

# Display the migration content
echo "===== MIGRATION CONTENT ====="
cat supabase/migrations/20260129_payment_methods_and_adjustments.sql
echo ""
echo "===== END MIGRATION ====="
