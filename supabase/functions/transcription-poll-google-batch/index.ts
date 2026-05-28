// POST /functions/v1/transcription-poll-google-batch
//
// Cron-driven (every 30s via pg_cron). Finds transcription_jobs where Google
// STT v2 batchRecognize was kicked off (provider_async_operation_name IS NOT
// NULL) and polls each Long Running Operation. When an operation completes:
//   * parse the inline response into canonical v2 segments
//   * write transcript_text + transcript_json + word_count to the job
//   * clear the async tracking columns
//   * trigger the downstream chain (ai-check, ai-translate, deliver)
//   * best-effort delete the staged GCS audio file
//
// When an operation fails or times out (> 90 min): mark the job failed, audit,
// clear tracking columns.
//
// Auth: x-cron-secret header (shared with other cron-only edge functions in
// this project — see _shared/require-cron-secret.ts).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { deleteFromGcs } from "../_shared/google-storage.ts";
import {
  type Segment,
  type ProviderHint,
  normalizeToSegments,
  buildTranscriptJsonV2,
  denormalizeText,
  TRANSCRIPT_FORMAT_VERSION,
} from "../_shared/transcript-segments.ts";

const STUCK_OPERATION_MAX_AGE_MS = 90 * 60 * 1000;   // 90 min → mark failed
const POLL_BATCH_SIZE = 25;                           // jobs to poll per cron tick

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const auth = await requireCronSecret(req);
  if (!auth.ok) {
    return jsonResponse({ success: false, error: auth.error }, auth.status);
  }

  const admin = getServiceClient();

  // Find jobs with active Google batch operations.
  const { data: pending, error: queryErr } = await admin
    .from("transcription_jobs")
    .select("id, provider_async_operation_name, provider_async_started_at, provider_async_gcs_uri, source_files, source_language_id, translation_requested, translation_target_language_id, ai_total_cost, file_duration_seconds")
    .eq("provider", "google")
    .eq("status", "processing")
    .not("provider_async_operation_name", "is", null)
    .is("deleted_at", null)
    .limit(POLL_BATCH_SIZE);

  if (queryErr) {
    console.error("poll: query failed", queryErr);
    return jsonResponse({ success: false, error: "Query failed" }, 500);
  }

  const summary = {
    checked: pending?.length ?? 0,
    completed: 0,
    still_running: 0,
    failed: 0,
    timed_out: 0,
  };

  for (const job of pending ?? []) {
    const jobId = job.id as string;
    const opName = job.provider_async_operation_name as string;
    const startedAt = job.provider_async_started_at as string | null;
    const gcsUri = job.provider_async_gcs_uri as string | null;

    // Stuck-operation timeout
    if (startedAt) {
      const age = Date.now() - new Date(startedAt).getTime();
      if (age > STUCK_OPERATION_MAX_AGE_MS) {
        await markStuck(admin, jobId, opName, gcsUri, age);
        summary.timed_out++;
        continue;
      }
    }

    let pollResp: Response;
    try {
      const token = await getGoogleAccessToken();
      // chirp_2 operations live in a regional location; the LRO GET must
      // use the matching regional hostname. Extract from the opName path
      // (shape: projects/{id}/locations/{region}/operations/{id}).
      const locMatch = opName.match(/\/locations\/([^/]+)\//);
      const region = locMatch?.[1] ?? "global";
      const host = region === "global"
        ? "https://speech.googleapis.com"
        : `https://${region}-speech.googleapis.com`;
      pollResp = await fetch(`${host}/v2/${opName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error(`poll: fetch failed for ${jobId}`, e);
      continue;
    }

    if (!pollResp.ok) {
      const errText = await pollResp.text();
      console.error(`poll: ${pollResp.status} on ${opName} — ${errText.slice(0, 300)}`);
      // Auth or quota errors: leave for next tick. 404 on the operation = mark failed.
      if (pollResp.status === 404) {
        await markOperationFailed(admin, jobId, opName, gcsUri, `Google operation 404 (vanished or expired): ${errText.slice(0, 200)}`);
        summary.failed++;
      }
      continue;
    }

    const opData = await pollResp.json();
    if (!opData.done) {
      summary.still_running++;
      continue;
    }

    if (opData.error) {
      const errMsg = `Google STT batch operation failed: code=${opData.error.code} message=${opData.error.message}`;
      await markOperationFailed(admin, jobId, opName, gcsUri, errMsg);
      summary.failed++;
      continue;
    }

    // Success — parse the inline response
    try {
      const filesMap = opData.response?.results as Record<string, unknown> | undefined;
      if (!filesMap || Object.keys(filesMap).length === 0) {
        await markOperationFailed(admin, jobId, opName, gcsUri, "Google STT batch returned empty results map");
        summary.failed++;
        continue;
      }

      // Single-file jobs only (per transcription-process invariant). Grab the
      // first (and only) file result.
      const firstKey = Object.keys(filesMap)[0];
      const fileResult = filesMap[firstKey] as Record<string, unknown>;
      if ((fileResult as { error?: unknown }).error) {
        const err = (fileResult as { error: { message?: string } }).error;
        await markOperationFailed(admin, jobId, opName, gcsUri, `Google STT file error: ${err.message ?? "unknown"}`);
        summary.failed++;
        continue;
      }

      const transcript = (fileResult as { transcript?: { results?: Array<Record<string, unknown>> } }).transcript;
      const results = transcript?.results ?? [];

      // Parse using the same shape parser as sync — words have startOffset
      // strings + speakerLabel which our normalizeToSegments handles via the
      // "google" provider hint.
      const parsed = parseSttResults(results);

      // Normalize to v2 segments (id-keyed, immutable speaker/start/end)
      const segments = await normalizeToSegments(
        {
          words: parsed.words,
          language_code: parsed.detectedLanguage,
        },
        { provider: "google" as ProviderHint, idStrategy: "random" },
      );

      const segmentText = denormalizeText(segments) || parsed.text;
      const wordCount = segmentText.split(/\s+/).filter(Boolean).length;
      const audioDurationSec = (job.file_duration_seconds as number) ?? 0;

      const transcriptJsonV2 = buildTranscriptJsonV2(segments, {
        provider: "google",
        language_code: parsed.detectedLanguage ?? undefined,
        audio_duration: audioDurationSec,
      });

      // STT cost — Google Chirp 2 batch is ~ $0.016/min (USD)
      const sttCost = (audioDurationSec / 60) * 0.016;
      const prevCost = (job.ai_total_cost as number) ?? 0;

      // Insert version row
      await admin
        .from("transcription_versions")
        .update({ is_active: false })
        .eq("job_id", jobId)
        .eq("is_active", true);

      await admin.from("transcription_versions").insert({
        job_id: jobId,
        version_type: "original",
        provider: "google",
        model: "chirp_2",
        transcript_text: segmentText,
        transcript_json: transcriptJsonV2,
        transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
        word_count: wordCount,
        cost: sttCost,
        is_active: true,
      });

      // Update job row, clear async tracking
      await admin
        .from("transcription_jobs")
        .update({
          transcript_text: segmentText,
          transcript_json: transcriptJsonV2,
          transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
          detected_language: parsed.detectedLanguage ?? null,
          word_count: wordCount,
          provider_cost: sttCost,
          ai_total_cost: prevCost + sttCost,
          provider_async_operation_name: null,
          provider_async_started_at: null,
          provider_async_gcs_uri: null,
        })
        .eq("id", jobId);

      await auditLog(admin, jobId, "google_batch_completed", "system", null, {
        operation_name: opName,
        word_count: wordCount,
        detected_language: parsed.detectedLanguage,
        stt_cost: sttCost.toFixed(6),
        segment_count: segments.length,
      });

      // Cleanup the staged GCS file (best-effort)
      if (gcsUri) deleteFromGcs(gcsUri);

      // Trigger downstream chain — fire and forget
      triggerDownstreamChain(jobId, job).catch((e) =>
        console.error(`poll: downstream trigger failed for ${jobId}`, e),
      );

      summary.completed++;
    } catch (e) {
      console.error(`poll: parse/update failed for ${jobId}`, e);
      await markOperationFailed(admin, jobId, opName, gcsUri, e instanceof Error ? e.message : String(e));
      summary.failed++;
    }
  }

  return jsonResponse({ success: true, ...summary });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ParsedSttResult {
  text: string;
  words: Array<Record<string, unknown>>;
  detectedLanguage: string | null;
}

function parseSttResults(results: Array<Record<string, unknown>>): ParsedSttResult {
  const fullText: string[] = [];
  const allWords: Array<Record<string, unknown>> = [];
  let detectedLanguage: string | null = null;
  for (const r of results) {
    const lang = r.languageCode as string | undefined;
    if (lang && !detectedLanguage) detectedLanguage = lang;
    const alt = (r.alternatives as Array<Record<string, unknown>> | undefined)?.[0];
    if (!alt) continue;
    if (alt.transcript) fullText.push(String(alt.transcript));
    const words = (alt.words as Array<Record<string, unknown>> | undefined) ?? [];
    for (const w of words) {
      allWords.push({
        text: w.word,
        startOffset: w.startOffset,
        endOffset: w.endOffset,
        speaker: w.speakerLabel,
      });
    }
  }
  return { text: fullText.join(" ").trim(), words: allWords, detectedLanguage };
}

async function markOperationFailed(
  admin: ReturnType<typeof getServiceClient>,
  jobId: string,
  opName: string,
  gcsUri: string | null,
  reason: string,
): Promise<void> {
  await admin
    .from("transcription_jobs")
    .update({
      status: "failed",
      ai_quality_notes: `Google batchRecognize failed: ${reason.slice(0, 500)}`,
      provider_async_operation_name: null,
      provider_async_started_at: null,
      provider_async_gcs_uri: null,
    })
    .eq("id", jobId);
  await auditLog(admin, jobId, "google_batch_failed", "system", null, {
    operation_name: opName,
    reason,
  });
  if (gcsUri) deleteFromGcs(gcsUri);
}

async function markStuck(
  admin: ReturnType<typeof getServiceClient>,
  jobId: string,
  opName: string,
  gcsUri: string | null,
  ageMs: number,
): Promise<void> {
  await markOperationFailed(
    admin,
    jobId,
    opName,
    gcsUri,
    `Operation has been running for ${Math.round(ageMs / 60000)} min (cap is ${STUCK_OPERATION_MAX_AGE_MS / 60000} min). Assumed dead.`,
  );
}

// Fire-and-forget downstream chain — mirrors transcription-process's
// post-STT chain so a completed batch job lands on the same pipeline.
async function triggerDownstreamChain(jobId: string, job: Record<string, unknown>): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // AI quality check (fire and forget)
  fetch(`${supabaseUrl}/functions/v1/transcription-ai-check`, {
    method: "POST",
    headers,
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error("ai-check failed:", e));

  // Translation (blocking if requested)
  if (job.translation_requested && job.translation_target_language_id) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/transcription-ai-translate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ job_id: jobId }),
      });
    } catch (e) {
      console.error("translation failed:", e);
    }
  }

  // Delivery (fire and forget — generates output files + emails customer)
  fetch(`${supabaseUrl}/functions/v1/transcription-deliver`, {
    method: "POST",
    headers,
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error("deliver failed:", e));
}
