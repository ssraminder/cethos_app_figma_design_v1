#!/usr/bin/env bash
# Deploy the May 14 2026 security remediation:
#   - applies the four RLS migrations
#   - deploys the five customer-quote-* edge functions
#
# Re-running this is safe: every migration is idempotent (drops policies
# before recreating, uses ON CONFLICT for storage.buckets, ENABLE RLS is
# a no-op when already on), and edge function deploys overwrite the
# previous version with the same name.
#
# Usage:
#   PROJECT_REF=xxxxxxxxxxxx scripts/deploy-security-changes.sh
# Or:
#   scripts/deploy-security-changes.sh --project-ref xxxxxxxxxxxx
#
# Requirements:
#   - supabase CLI installed (https://supabase.com/docs/guides/cli/getting-started)
#   - You are logged in (`supabase login`) and have access to the project
#   - Run from the repo root

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-}"
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      PROJECT_REF="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found." >&2
  echo "Install: https://supabase.com/docs/guides/cli/getting-started" >&2
  exit 1
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "PROJECT_REF is required. Pass --project-ref or set PROJECT_REF=…" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY-RUN: $*"
  else
    echo "+ $*"
    "$@"
  fi
}

echo "== Linking to Supabase project $PROJECT_REF =="
run supabase link --project-ref "$PROJECT_REF"

# Confirm the migrations we expect to apply are present.
EXPECTED_MIGRATIONS=(
  "20260514_emergency_rls_lockdown.sql"
  "20260514_quote_adjustments_lockdown.sql"
  "20260514_staff_auth_linkage.sql"
  "20260514_v2_extended_lockdown.sql"
)
for m in "${EXPECTED_MIGRATIONS[@]}"; do
  if [[ ! -f "supabase/migrations/$m" ]]; then
    echo "Missing expected migration: supabase/migrations/$m" >&2
    exit 1
  fi
done
echo "All four expected migrations present."

echo
echo "== Applying database migrations (supabase db push) =="
run supabase db push

EDGE_FUNCTIONS=(
  customer-quote-create
  customer-quote-get
  customer-quote-update
  customer-quote-finalize-files
  customer-quote-attach-customer
)

echo
echo "== Deploying ${#EDGE_FUNCTIONS[@]} edge function(s) =="
for fn in "${EDGE_FUNCTIONS[@]}"; do
  if [[ ! -d "supabase/functions/$fn" ]]; then
    echo "Missing function directory: supabase/functions/$fn" >&2
    exit 1
  fi
  echo "-- $fn"
  run supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo
echo "== Done =="
cat <<'EOF'
Next steps:
  1. Rotate the anon key + JWT secret in Supabase Settings → API. Update
     .env.local and any deployment env (Netlify) with the new key.
  2. Run the audit harness against the project to verify nothing leaks:
       VITE_SUPABASE_URL=https://<ref>.supabase.co \
       VITE_SUPABASE_ANON_KEY=<new-anon-key> \
       SUPABASE_SERVICE_ROLE_KEY=<service-role> \
       npm run rls:audit
  3. Walk through the customer wizard (anon /quote → upload → details →
     contact → checkout → review/save/revision) and one admin page
     (PreprocessOCRPage or AdminQuoteDetail) to confirm nothing 0-rows.
EOF
