# Audio extractor — Cloud Run service that runs ffmpeg to convert any
# uploaded video/audio into Opus-encoded WebM (16 kHz mono, 32 kbps by
# default) suitable for Google STT batchRecognize or other STT providers.
#
# Build + deploy in one command from the services/audio-extractor directory:
#   gcloud run deploy cethos-stt-extractor \
#     --source . \
#     --region us-central1 \
#     --memory 2Gi --cpu 2 --timeout 3600 \
#     --concurrency 1 --max-instances 5 \
#     --no-allow-unauthenticated \
#     --set-env-vars EXTRACTOR_SECRET=<paste-secret-here>
#
# (See README.md for the full deployment recipe.)

FROM node:20-slim

# System ffmpeg + a small build prerequisite for any compiled modules.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better Docker layer caching
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source last so code edits don't bust the npm install cache
COPY index.js ./

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "index.js"]
