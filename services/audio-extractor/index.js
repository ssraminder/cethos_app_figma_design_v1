// Cethos audio extractor — Cloud Run service.
//
// POST /extract
//   Headers:
//     Content-Type: application/json
//     x-cethos-secret: <shared secret from EXTRACTOR_SECRET env var>
//   Body:
//     {
//       "input_url":         "https://...",        // any HTTP(S) URL (Supabase signed URL works)
//       "output_upload_url": "https://...",        // signed PUT URL where audio goes
//       "output_upload_method": "PUT" | "POST",    // optional, default PUT
//       "output_content_type":  "audio/webm",      // optional, default audio/webm
//       "bitrate_kbps":      32,                    // optional, default 32 (good for speech)
//       "channels":          1,                     // optional, default 1
//       "sample_rate_hz":    16000                  // optional, default 16000 (STT-friendly)
//     }
//   Response (200):
//     { "success": true, "duration_seconds": 7234, "output_size_bytes": 28934512 }
//   Response (4xx/5xx):
//     { "success": false, "error": "<message>" }
//
// Auth: shared secret header (x-cethos-secret). Cloud Run can also be deployed
// with --no-allow-unauthenticated + IAM-based invoker permission for a stronger
// guarantee; the shared secret is a belt-and-suspenders check inside the
// container regardless.
//
// Architecture: streaming where possible. We pipe the input HTTP response into
// ffmpeg via stdin, ffmpeg writes Opus/WebM to stdout, and we collect the
// output into a buffer that we PUT to the upload URL at the end. For a 2hr
// video at 32 kbps mono, the output is ~30 MB which fits in memory comfortably
// at our 2 Gi memory ceiling. If we ever need 8hr+ files we can switch to
// streaming-upload via a multipart PUT.

const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const { Readable } = require("stream");

const PORT = process.env.PORT || 8080;
const SECRET = process.env.EXTRACTOR_SECRET || "";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "cethos-audio-extractor" }));

app.post("/extract", async (req, res) => {
  if (!SECRET) {
    return res.status(503).json({ success: false, error: "EXTRACTOR_SECRET not configured on service" });
  }
  const provided = req.headers["x-cethos-secret"];
  if (!provided || provided !== SECRET) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  const {
    input_url,
    output_upload_url,
    output_upload_method = "PUT",
    output_content_type = "audio/webm",
    bitrate_kbps = 32,
    channels = 1,
    sample_rate_hz = 16000,
  } = req.body || {};

  if (!input_url || !output_upload_url) {
    return res.status(400).json({ success: false, error: "input_url and output_upload_url are required" });
  }

  const startMs = Date.now();
  let inputResp;
  try {
    inputResp = await fetch(input_url);
  } catch (e) {
    return res.status(502).json({ success: false, error: `failed to reach input_url: ${e.message}` });
  }
  if (!inputResp.ok || !inputResp.body) {
    return res.status(502).json({
      success: false,
      error: `input_url returned ${inputResp.status}`,
    });
  }

  // Pipe the fetch Response body (Web stream) into a Node Readable for ffmpeg.
  const inputStream = Readable.fromWeb(inputResp.body);

  // Collect ffmpeg stdout into a buffer. For files > a few hundred MB we'd
  // want to stream this through to the output upload — see comment at top.
  const chunks = [];
  let duration = 0;

  try {
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputStream)
        .noVideo()
        .audioCodec("libopus")
        .audioBitrate(`${bitrate_kbps}k`)
        .audioChannels(channels)
        .audioFrequency(sample_rate_hz)
        .format("webm")
        .on("codecData", (data) => {
          // data.duration looks like "01:23:45.67"
          const m = (data?.duration || "").match(/^(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (m) {
            duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
          }
        })
        .on("stderr", (line) => {
          // Quiet by default — Cloud Run logs ffmpeg's stderr if we don't.
          // Uncomment for debugging.
          // console.log("ffmpeg:", line);
        })
        .on("error", (err) => reject(err))
        .on("end", () => resolve());

      const out = command.pipe();
      out.on("data", (chunk) => chunks.push(chunk));
      out.on("error", (err) => reject(err));
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: `ffmpeg failed: ${e.message || String(e)}`,
    });
  }

  const outputBuffer = Buffer.concat(chunks);
  const extractMs = Date.now() - startMs;

  // Upload to the signed URL the caller provided.
  let uploadResp;
  try {
    uploadResp = await fetch(output_upload_url, {
      method: output_upload_method,
      headers: { "Content-Type": output_content_type },
      body: outputBuffer,
    });
  } catch (e) {
    return res.status(502).json({
      success: false,
      error: `failed to reach output_upload_url: ${e.message}`,
      duration_seconds: Math.ceil(duration),
      output_size_bytes: outputBuffer.length,
    });
  }

  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => "");
    return res.status(502).json({
      success: false,
      error: `upload returned ${uploadResp.status}: ${errText.slice(0, 200)}`,
      duration_seconds: Math.ceil(duration),
      output_size_bytes: outputBuffer.length,
    });
  }

  const totalMs = Date.now() - startMs;
  return res.json({
    success: true,
    duration_seconds: Math.ceil(duration),
    output_size_bytes: outputBuffer.length,
    extract_ms: extractMs,
    total_ms: totalMs,
  });
});

app.listen(PORT, () => {
  console.log(`cethos-audio-extractor listening on ${PORT}`);
});
