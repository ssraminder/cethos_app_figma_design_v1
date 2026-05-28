// Cethos audio extractor — Cloud Run service.
//
// POST /extract
//   Headers:
//     Content-Type: application/json
//     Authorization: Bearer <Google ID token for this service URL>   (set by Cloud Run
//                    --no-allow-unauthenticated invoker, Cethos's Supabase edge fn
//                    mints it via the GOOGLE_APPLICATION_CREDENTIALS_JSON service account)
//     x-cethos-secret: <shared secret from EXTRACTOR_SECRET env var>  (defense in depth)
//   Body:
//     {
//       "input_url":          "https://...",        // any HTTP(S) URL (GCS signed URL)
//       "output_upload_url":  "https://...",        // signed PUT URL where audio goes
//       "output_upload_method": "PUT" | "POST",     // optional, default PUT
//       "output_content_type":  "audio/webm",       // optional, default audio/webm
//       "bitrate_kbps":       32,                    // optional, default 32 (good for speech)
//       "channels":           1,                     // optional, default 1
//       "sample_rate_hz":     16000                  // optional, default 16000
//     }
//   Response (200):
//     { "success": true, "duration_seconds": 7234, "output_size_bytes": 28934512 }
//
// Implementation: download input to a temp file, run ffmpeg on the file path
// (NOT stdin), upload the output temp file via streaming PUT. The previous
// stdin-pipe approach via Readable.fromWeb produced empty Opus containers
// because ffmpeg couldn't autodetect the input container format without a
// seekable source. File-based input is reliable for any container ffmpeg
// supports and handles arbitrarily large files within our memory budget
// since neither file is loaded fully into RAM.

const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { pipeline } = require("stream/promises");
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

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "extract-"));
  const inputPath = path.join(tmpDir, "input.bin");
  const outputPath = path.join(tmpDir, "output.webm");
  const startMs = Date.now();

  try {
    // ── 1. Download input to a temp file ──
    let inputResp;
    try {
      inputResp = await fetch(input_url);
    } catch (e) {
      return res.status(502).json({ success: false, error: `failed to reach input_url: ${e.message}` });
    }
    if (!inputResp.ok || !inputResp.body) {
      return res.status(502).json({ success: false, error: `input_url returned ${inputResp.status}` });
    }
    const downloadStart = Date.now();
    await pipeline(Readable.fromWeb(inputResp.body), fs.createWriteStream(inputPath));
    const inputStat = await fsp.stat(inputPath);
    const downloadMs = Date.now() - downloadStart;
    console.log(`download: ${inputStat.size} bytes in ${downloadMs} ms`);

    // ── 2. Run ffmpeg on the temp file (seekable, format auto-detection works) ──
    let duration = 0;
    const extractStart = Date.now();
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libopus")
        .audioBitrate(`${bitrate_kbps}k`)
        .audioChannels(channels)
        .audioFrequency(sample_rate_hz)
        .format("webm")
        .on("codecData", (data) => {
          const m = (data?.duration || "").match(/^(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (m) {
            duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
          }
        })
        .on("stderr", (line) => {
          // ffmpeg writes everything (including progress) to stderr; log so
          // Cloud Run audit shows what happened on failure
          console.log(`ffmpeg: ${line}`);
        })
        .on("error", (err) => reject(err))
        .on("end", () => resolve())
        .save(outputPath);
    });
    const extractMs = Date.now() - extractStart;

    const outputStat = await fsp.stat(outputPath);
    console.log(`extract: ${outputStat.size} bytes in ${extractMs} ms`);

    if (outputStat.size < 1024) {
      // Sanity: under 1 KB is almost certainly a container-header-only output.
      // Better to fail loud than silently send empty audio to STT.
      return res.status(500).json({
        success: false,
        error: `extraction produced suspiciously small output (${outputStat.size} bytes) — input may have had no audio track or used a codec ffmpeg couldn't decode`,
        duration_seconds: Math.ceil(duration),
      });
    }

    // ── 3. Stream the temp file out via PUT ──
    const uploadStart = Date.now();
    const fileStream = fs.createReadStream(outputPath);
    const uploadResp = await fetch(output_upload_url, {
      method: output_upload_method,
      headers: {
        "Content-Type": output_content_type,
        "Content-Length": String(outputStat.size),
      },
      // duplex needed when body is a stream (Node 18+ fetch)
      duplex: "half",
      body: fileStream,
    });
    const uploadMs = Date.now() - uploadStart;

    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      return res.status(502).json({
        success: false,
        error: `upload returned ${uploadResp.status}: ${errText.slice(0, 200)}`,
        duration_seconds: Math.ceil(duration),
        output_size_bytes: outputStat.size,
      });
    }

    const totalMs = Date.now() - startMs;
    return res.json({
      success: true,
      duration_seconds: Math.ceil(duration),
      output_size_bytes: outputStat.size,
      download_ms: downloadMs,
      extract_ms: extractMs,
      upload_ms: uploadMs,
      total_ms: totalMs,
    });
  } catch (e) {
    console.error("extract failed:", e);
    return res.status(500).json({
      success: false,
      error: e?.message || String(e),
    });
  } finally {
    // Clean up temp dir regardless of outcome
    try {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.warn("temp cleanup failed:", e?.message || e);
    }
  }
});

app.listen(PORT, () => {
  console.log(`cethos-audio-extractor listening on ${PORT}`);
});
