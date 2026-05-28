#!/usr/bin/env bash
#
# scripts/setup-gcs.sh
#
# One-time bootstrap for the Cethos transcription pipeline's Google Cloud
# Storage bucket. Run this once per GCP project; the edge functions
# (transcription-process, transcription-create-gcs-upload-url,
# transcription-poll-google-batch, Cloud Run audio extractor) then operate
# with narrow object-level permissions and never attempt bucket-level work
# at runtime.
#
# Requires: gcloud, authenticated as a principal with:
#   - roles/storage.admin (to create the bucket + set CORS + lifecycle)
#   - resourcemanager.projects.setIamPolicy (to grant the service account
#     object-level access)
#
# After this script runs, the service account used by Supabase edge functions
# only needs roles/storage.objectAdmin on the created bucket — no project-level
# permissions, no ability to create or delete other buckets.

set -euo pipefail

# ── Inputs ──────────────────────────────────────────────────────────────────

PROJECT_ID="${1:-}"
SERVICE_ACCOUNT_EMAIL="${2:-}"
BUCKET_NAME="${3:-}"
LOCATION="${4:-US}"

if [[ -z "$PROJECT_ID" || -z "$SERVICE_ACCOUNT_EMAIL" ]]; then
  cat <<USAGE
Usage:
  $0 <gcp-project-id> <service-account-email> [bucket-name] [location]

Examples:
  # Default: bucket name derived as <project>-stt-input, US multi-region
  $0 cethos-automation docai-runner@cethos-automation.iam.gserviceaccount.com

  # Custom bucket name + region
  $0 cethos-automation docai-runner@cethos-automation.iam.gserviceaccount.com cethos-stt us-central1

USAGE
  exit 1
fi

if [[ -z "$BUCKET_NAME" ]]; then
  BUCKET_NAME="${PROJECT_ID}-stt-input"
fi

echo "─────────────────────────────────────────────────────────"
echo " Cethos STT bucket setup"
echo "─────────────────────────────────────────────────────────"
echo " Project:         $PROJECT_ID"
echo " Bucket:          gs://$BUCKET_NAME"
echo " Location:        $LOCATION"
echo " Service account: $SERVICE_ACCOUNT_EMAIL"
echo "─────────────────────────────────────────────────────────"
read -r -p "Proceed? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "Aborted."; exit 1; }

# ── 1. Enable required APIs (idempotent) ────────────────────────────────────

echo
echo "[1/5] Enabling APIs (no-op if already enabled)..."
gcloud services enable \
  storage.googleapis.com \
  speech.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Create the bucket (skip if it already exists) ────────────────────────

echo
echo "[2/5] Checking for bucket..."
if gcloud storage buckets describe "gs://$BUCKET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "       Bucket already exists — skipping create."
else
  echo "       Creating bucket..."
  gcloud storage buckets create "gs://$BUCKET_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

# ── 3. Lifecycle rule: auto-delete objects after 1 day ──────────────────────

echo
echo "[3/5] Applying 1-day object lifecycle..."
LIFECYCLE_FILE=$(mktemp)
cat > "$LIFECYCLE_FILE" <<'JSON'
{
  "rule": [
    { "action": { "type": "Delete" }, "condition": { "age": 1 } }
  ]
}
JSON
gcloud storage buckets update "gs://$BUCKET_NAME" --lifecycle-file="$LIFECYCLE_FILE"
rm -f "$LIFECYCLE_FILE"

# ── 4. CORS for browser uploads from cethos surfaces ────────────────────────

echo
echo "[4/5] Applying CORS for browser PUT/GET..."
CORS_FILE=$(mktemp)
cat > "$CORS_FILE" <<'JSON'
[
  {
    "origin": [
      "https://portal.cethos.com",
      "https://cethos.com",
      "https://www.cethos.com",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "method": ["PUT", "GET", "HEAD", "OPTIONS"],
    "responseHeader": [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "ETag",
      "X-Goog-*",
      "Access-Control-Allow-Origin"
    ],
    "maxAgeSeconds": 3600
  }
]
JSON
gcloud storage buckets update "gs://$BUCKET_NAME" --cors-file="$CORS_FILE"
rm -f "$CORS_FILE"

# ── 5. Grant the service account narrow object-level access ─────────────────

echo
echo "[5/5] Granting roles/storage.objectAdmin to $SERVICE_ACCOUNT_EMAIL on the bucket..."
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET_NAME" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/storage.objectAdmin"

echo
echo "─────────────────────────────────────────────────────────"
echo " ✓ Done."
echo
echo " If your bucket name differs from the default, set this Supabase secret:"
echo "   CETHOS_STT_BUCKET=$BUCKET_NAME"
echo
echo " The edge function transcription-create-gcs-upload-url will now"
echo " succeed without bucket-level permissions at runtime."
echo "─────────────────────────────────────────────────────────"
