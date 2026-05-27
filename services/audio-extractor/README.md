# cethos-stt-extractor (Cloud Run)

Server-side audio extractor used by `transcription-process` so the admin upload modal doesn't have to wait on multi-hour client-side MediaRecorder playback.

## What it does

`POST /extract` downloads a video/audio URL, runs ffmpeg to extract Opus-encoded mono audio at 16 kHz / 32 kbps (Google STT-friendly), and uploads the result to a signed PUT URL the caller provides. Returns duration + output size.

## One-time deployment

Run these from inside `services/audio-extractor/` on a machine with the `gcloud` CLI authenticated to the Cethos GCP project (the same one that hosts the STT credentials).

### 1. Pick a shared secret

```bash
EXTRACTOR_SECRET=$(openssl rand -hex 32)
echo "$EXTRACTOR_SECRET"   # save this — you'll set it on Supabase too
```

### 2. Deploy via Cloud Build (no Docker registry needed)

```bash
gcloud run deploy cethos-stt-extractor \
  --source . \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 1 \
  --max-instances 5 \
  --min-instances 0 \
  --no-allow-unauthenticated \
  --set-env-vars "EXTRACTOR_SECRET=$EXTRACTOR_SECRET"
```

What each flag does:

- `--memory 2Gi` — enough headroom to buffer ~hundreds of MB of audio output. For 2hr at 32 kbps you'll use ~30 MB; for 8hr ~120 MB. 2 Gi keeps us safely above either.
- `--cpu 2` — ffmpeg benefits from a second core for Opus encoding.
- `--timeout 3600` — Cloud Run's max request timeout (60 min). A 2hr extraction usually takes 1–3 min on this CPU.
- `--concurrency 1` — one extraction per container instance. Avoids ffmpeg processes contending for CPU/memory.
- `--max-instances 5` — caps parallel extractions at 5 (cost guard).
- `--min-instances 0` — scale to zero when idle (this is what makes the service ~free when nobody's uploading).
- `--no-allow-unauthenticated` — Cloud Run rejects requests without a valid Google ID token. The shared secret is belt-and-suspenders inside the container.

Capture the deployed URL — it looks like `https://cethos-stt-extractor-XXXXXXXXXX-uc.a.run.app`.

### 3. Grant the Supabase service account invoker permission

Replace `<service-account-email>` with the service account from `GOOGLE_APPLICATION_CREDENTIALS_JSON` (the `client_email` field):

```bash
gcloud run services add-iam-policy-binding cethos-stt-extractor \
  --region us-central1 \
  --member "serviceAccount:<service-account-email>" \
  --role "roles/run.invoker"
```

### 4. Set Supabase secrets

In the Supabase dashboard (or via CLI):

```
CETHOS_AUDIO_EXTRACTOR_URL=https://cethos-stt-extractor-XXXXXXXXXX-uc.a.run.app
CETHOS_AUDIO_EXTRACTOR_SECRET=<the EXTRACTOR_SECRET from step 1>
```

Done. `transcription-process` will start using the service for video files automatically.

## Local dev

```bash
npm install
EXTRACTOR_SECRET=devsecret node index.js
# in another terminal:
curl -X POST http://localhost:8080/extract \
  -H 'Content-Type: application/json' \
  -H 'x-cethos-secret: devsecret' \
  -d '{
    "input_url": "https://example.com/sample-video.mp4",
    "output_upload_url": "https://your-supabase-signed-put-url..."
  }'
```

Requires `ffmpeg` on the host machine (install via `apt`, `brew`, or `choco install ffmpeg`).

## Cost guide

| Usage | Estimated monthly cost |
|-------|-----------------------|
| Idle (0 requests) | $0 (scale to zero) |
| 10 × 2hr extractions/mo | ~$0.30 |
| 100 × 2hr extractions/mo | ~$3 |
| 1000 × 2hr extractions/mo | ~$30 |

Cloud Run charges per request + per millisecond of container time + memory allocated. Audio extraction is mostly CPU-bound and finishes quickly relative to the input length (2hr video → ~1-3 min of CPU time at 2 vCPU).

## Troubleshooting

- **403 from Cloud Run when invoked from Supabase**: the service account doesn't have `roles/run.invoker`. Re-run step 3.
- **401 unauthorized inside the container**: the `x-cethos-secret` header doesn't match `EXTRACTOR_SECRET`. Check both ends.
- **ffmpeg failed: Invalid data found when processing input**: the `input_url` returned something that isn't valid media. Check the signed URL is still alive and pointing at the right file.
- **Timeout after 60 min**: the input file was unusually long or the input download was slow. Raise `--timeout` (max is 3600 on Cloud Run) or split the input.
