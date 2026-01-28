#!/bin/bash

# Deploy reject-quote-permanent Edge Function to Supabase
# Usage: ./deploy-reject-quote.sh

set -e

echo "🚀 Deploying reject-quote-permanent Edge Function..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with: npm install -g supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase. Run: supabase login"
    exit 1
fi

# Deploy the function
cd "$(dirname "$0")/.."
supabase functions deploy reject-quote-permanent

echo "✅ Function deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Test the function in the Supabase dashboard"
echo "2. Try rejecting a quote in the HITL review interface"
echo "3. Check the logs if any errors occur"
