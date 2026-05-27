// Server-side audio extraction client.
//
// Delegates to the cethos-stt-extractor Cloud Run service for video → audio
// conversion (ffmpeg). The service downloads the input via signed URL, runs
// ffmpeg to produce 16 kHz mono Opus/WebM, and uploads to a signed Supabase
// storage PUT URL we generate here.
//
// Edge functions can't run ffmpeg themselves (Deno has no subprocess access
// in Supabase's edge runtime), so any video file that needs audio extraction
// goes through this path.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type ExtractResult = {
  success: true;
  durationSeconds: number;
  outputSizeBytes: number;
  outputPath: string;
  outputFormat: "webm";
  extractMs: number;
  totalMs: number;
} | {
  success: false;
  error: string;
};

export interface ExtractOptions {
  // Path inside the transcription-uploads bucket where the source file lives.
  inputBucket: string;
  inputPath: string;
  // Where to write the extracted audio (same bucket, derived path is fine).
  outputBucket: string;
  outputPath: string;
  // Optional ffmpeg knobs — defaults are STT-friendly (Opus 32 kbps mono 16 kHz).
  bitrateKbps?: number;
  channels?: number;
  sampleRateHz?: number;
}

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v", "3gp"]);

export function isVideoFile(format: string | null | undefined): boolean {
  if (!format) return false;
  return VIDEO_EXTENSIONS.has(format.toLowerCase());
}

export async function extractAudioViaCloudRun(opts: ExtractOptions): Promise<ExtractResult> {
  const extractorUrl = Deno.env.get("CETHOS_AUDIO_EXTRACTOR_URL");
  const extractorSecret = Deno.env.get("CETHOS_AUDIO_EXTRACTOR_SECRET");
  if (!extractorUrl) {
    return { success: false, error: "CETHOS_AUDIO_EXTRACTOR_URL not configured" };
  }
  if (!extractorSecret) {
    return { success: false, error: "CETHOS_AUDIO_EXTRACTOR_SECRET not configured" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Signed URL the extractor will download from
  const { data: signedIn, error: signInErr } = await admin.storage
    .from(opts.inputBucket)
    .createSignedUrl(opts.inputPath, 60 * 60);   // 1 hour
  if (signInErr || !signedIn?.signedUrl) {
    return { success: false, error: `failed to sign input URL: ${signInErr?.message ?? "unknown"}` };
  }

  // 2) Signed upload URL the extractor will PUT to
  const { data: signedOut, error: signOutErr } = await admin.storage
    .from(opts.outputBucket)
    .createSignedUploadUrl(opts.outputPath);
  if (signOutErr || !signedOut?.signedUrl) {
    return { success: false, error: `failed to sign output URL: ${signOutErr?.message ?? "unknown"}` };
  }

  // 3) Call the extractor. Cloud Run signed-upload-url expects a PUT.
  const extractEndpoint = `${extractorUrl.replace(/\/+$/, "")}/extract`;
  const body = {
    input_url: signedIn.signedUrl,
    output_upload_url: signedOut.signedUrl,
    output_upload_method: "PUT",
    output_content_type: "audio/webm",
    bitrate_kbps: opts.bitrateKbps ?? 32,
    channels: opts.channels ?? 1,
    sample_rate_hz: opts.sampleRateHz ?? 16000,
  };

  let resp: Response;
  try {
    resp = await fetch(extractEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cethos-secret": extractorSecret,
        // When the Cloud Run service is deployed --no-allow-unauthenticated,
        // the caller also needs an ID token. The Cloud Run service URL acts
        // as the audience. If/when we tighten this, mint the ID token here
        // via getGoogleAccessToken-style flow with aud = extractorUrl.
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { success: false, error: `extractor unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return { success: false, error: `extractor returned ${resp.status}: ${errText.slice(0, 300)}` };
  }

  const json = await resp.json();
  if (!json.success) {
    return { success: false, error: json.error ?? "extractor returned success:false" };
  }

  return {
    success: true,
    durationSeconds: Number(json.duration_seconds ?? 0),
    outputSizeBytes: Number(json.output_size_bytes ?? 0),
    outputPath: opts.outputPath,
    outputFormat: "webm",
    extractMs: Number(json.extract_ms ?? 0),
    totalMs: Number(json.total_ms ?? 0),
  };
}
