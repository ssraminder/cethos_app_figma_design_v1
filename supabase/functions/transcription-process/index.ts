// POST /functions/v1/transcription-process
// Body: { job_id: string }
// Called internally (fire-and-forget from upload, or after Stripe payment).
// Downloads audio from storage, runs STT via the job's provider,
// stores transcript, chains to AI quality check + translation + delivery.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  getTranscriptionSettings,
  auditLog,
} from "../_shared/transcription.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const admin = getServiceClient();

  let jobId: string;
  try {
    const body = await req.json();
    jobId = body.job_id;
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body" }, 400);
  }

  if (!jobId) {
    return jsonResponse({ success: false, error: "job_id required" }, 400);
  }

  try {
    // ── Load job ──────────────────────────────────────────────────────────

    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("*")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    if (job.status !== "processing" && job.status !== "pending" && job.status !== "failed") {
      return jsonResponse({
        success: false,
        error: `Job status is '${job.status}', expected 'processing', 'pending', or 'failed'`,
      }, 409);
    }

    // Mark as processing
    await admin
      .from("transcription_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    await auditLog(admin, jobId, "processing_started", "system", null, {
      provider: job.provider,
    });

    // ── Call STT provider ────────────────────────────────────────────────
    // AssemblyAI uses a signed URL (no download needed).
    // OpenAI / ElevenLabs need blob download (100 MB memory guard).
    // On any OpenAI/AssemblyAI failure → auto-fallback to ElevenLabs.

    const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

    let transcript: TranscriptResult;
    let provider = job.provider ?? "openai";
    const fileSize = (job.file_size_bytes as number) ?? 0;

    try {
      if (provider === "assemblyai") {
        const { data: signedUrlData, error: urlErr } = await admin.storage
          .from("transcription-uploads")
          .createSignedUrl(job.file_path as string, 3600);
        if (urlErr || !signedUrlData?.signedUrl) {
          throw new Error("Failed to create signed URL for audio file");
        }
        transcript = await transcribeAssemblyAi(signedUrlData.signedUrl, job);
      } else {
        if (fileSize > MAX_DOWNLOAD_BYTES) {
          await markFailed(admin, jobId, `File too large (${(fileSize / 1024 / 1024).toFixed(0)} MB). Extract audio from video before uploading.`);
          return jsonResponse({ success: false, error: "File too large — extract audio first" }, 400);
        }

        const { data: fileData, error: dlErr } = await admin.storage
          .from("transcription-uploads")
          .download(job.file_path);
        if (dlErr || !fileData) {
          console.error("Storage download failed:", dlErr);
          throw new Error("Failed to download audio file");
        }

        try {
          if (provider === "openai") {
            transcript = await transcribeOpenAi(fileData, job);
          } else {
            transcript = await transcribeElevenLabs(fileData, job);
          }
        } catch (primaryErr) {
          if (provider !== "elevenlabs") {
            console.log(`${provider} failed, falling back to ElevenLabs:`, primaryErr);
            const origProvider = provider;
            provider = "elevenlabs";
            await admin.from("transcription_jobs").update({ provider }).eq("id", jobId);
            await auditLog(admin, jobId, "provider_fallback", "system", null, {
              original: origProvider,
              fallback: "elevenlabs",
              reason: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
            });
            transcript = await transcribeElevenLabs(fileData, job);
          } else {
            throw primaryErr;
          }
        }
      }
    } catch (e) {
      console.error(`STT (${provider}) failed for ${jobId}:`, e);
      await markFailed(admin, jobId, `Transcription failed: ${e instanceof Error ? e.message : String(e)}`);
      return jsonResponse({ success: false, error: "Transcription failed" }, 500);
    }

    // ── Store transcript ─────────────────────────────────────────────────

    const wordCount = transcript.text.split(/\s+/).filter(Boolean).length;

    const { error: updateErr } = await admin
      .from("transcription_jobs")
      .update({
        transcript_text: transcript.text,
        transcript_json: transcript.json,
        detected_language: transcript.detectedLanguage ?? null,
        language_confidence: transcript.languageConfidence ?? null,
        word_count: wordCount,
        provider_job_id: transcript.providerJobId ?? null,
        provider_cost: transcript.providerCost ?? null,
      })
      .eq("id", jobId);

    if (updateErr) {
      console.error("Transcript update failed:", updateErr);
      await markFailed(admin, jobId, "Failed to store transcript");
      return jsonResponse({ success: false, error: "Failed to store transcript" }, 500);
    }

    await auditLog(admin, jobId, "transcription_completed", "system", null, {
      provider,
      word_count: wordCount,
      detected_language: transcript.detectedLanguage,
    });

    // ── Chain: AI quality check ──────────────────────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    fetch(`${supabaseUrl}/functions/v1/transcription-ai-check`, {
      method: "POST",
      headers,
      body: JSON.stringify({ job_id: jobId }),
    }).catch((e) => console.error("Failed to trigger AI check:", e));

    // ── Chain: AI translation (if requested) ─────────────────────────────

    if (job.translation_requested && job.translation_target_language_id) {
      fetch(`${supabaseUrl}/functions/v1/transcription-ai-translate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ job_id: jobId }),
      }).catch((e) => console.error("Failed to trigger AI translate:", e));
    }

    // ── Chain: delivery ──────────────────────────────────────────────────
    // Delivery waits a moment so translation can finish (if requested).
    // The deliver function checks if translation is done before sending.

    setTimeout(() => {
      fetch(`${supabaseUrl}/functions/v1/transcription-deliver`, {
        method: "POST",
        headers,
        body: JSON.stringify({ job_id: jobId }),
      }).catch((e) => console.error("Failed to trigger delivery:", e));
    }, job.translation_requested ? 30_000 : 5_000);

    return jsonResponse({
      success: true,
      job_id: jobId,
      word_count: wordCount,
      detected_language: transcript.detectedLanguage,
    });
  } catch (e) {
    console.error("transcription-process error:", e);
    await markFailed(admin, jobId, "Internal processing error");
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});

// ── Types ────────────────────────────────────────────────────────────────────

interface TranscriptResult {
  text: string;
  json: Record<string, unknown> | null;
  detectedLanguage?: string;
  languageConfidence?: number;
  providerJobId?: string;
  providerCost?: number;
}

// ── AssemblyAI ───────────────────────────────────────────────────────────────

async function transcribeAssemblyAi(
  audioUrl: string,
  job: Record<string, unknown>,
): Promise<TranscriptResult> {
  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not configured");

  const transcriptBody: Record<string, unknown> = {
    audio_url: audioUrl,
    language_detection: true,
  };

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("iso_639_1")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.iso_639_1) {
      transcriptBody.language_code = lang.iso_639_1;
      transcriptBody.language_detection = false;
    }
  }

  const createResp = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(transcriptBody),
  });

  if (!createResp.ok) {
    throw new Error(`AssemblyAI create failed: ${createResp.status}`);
  }

  const createResult = await createResp.json();
  const transcriptId = createResult.id;

  // 3. Poll for completion (max 10 minutes)
  const maxWait = 10 * 60 * 1000;
  const pollInterval = 5_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const pollResp = await fetch(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      { headers: { authorization: apiKey } },
    );

    if (!pollResp.ok) {
      throw new Error(`AssemblyAI poll failed: ${pollResp.status}`);
    }

    const result = await pollResp.json();

    if (result.status === "completed") {
      return {
        text: result.text ?? "",
        json: {
          words: result.words,
          utterances: result.utterances,
          confidence: result.confidence,
          audio_duration: result.audio_duration,
        },
        detectedLanguage: result.language_code,
        languageConfidence: result.confidence,
        providerJobId: transcriptId,
      };
    }

    if (result.status === "error") {
      throw new Error(`AssemblyAI error: ${result.error}`);
    }
  }

  throw new Error("AssemblyAI timeout: transcription took too long");
}

// ── OpenAI (gpt-4o-transcribe) ───────────────────────────────────────────────

async function transcribeOpenAi(
  audioBlob: Blob,
  job: Record<string, unknown>,
): Promise<TranscriptResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const ext = (job.file_format as string) ?? "mp3";
  const form = new FormData();
  form.append("file", new File([audioBlob], `audio.${ext}`, { type: audioBlob.type || "audio/mpeg" }));
  form.append("model", "gpt-4o-transcribe");
  form.append("response_format", "json");
  // Request logprobs to get detected language info
  form.append("include[]", "logprobs");

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("iso_639_1")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.iso_639_1) {
      form.append("language", lang.iso_639_1);
    }
  }

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI STT failed: ${resp.status} — ${errText}`);
  }

  const result = await resp.json();

  return {
    text: result.text ?? "",
    json: {
      logprobs: result.logprobs,
    },
    providerJobId: null,
  };
}

// ── ElevenLabs (Scribe v2) ───────────────────────────────────────────────────

async function transcribeElevenLabs(
  audioBlob: Blob,
  job: Record<string, unknown>,
): Promise<TranscriptResult> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const ext = (job.file_format as string) ?? "mp3";
  const form = new FormData();
  form.append("file", new File([audioBlob], `audio.${ext}`, { type: audioBlob.type || "audio/mpeg" }));
  form.append("model_id", "scribe_v2");

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("iso_639_1")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.iso_639_1) {
      form.append("language_code", lang.iso_639_1);
    }
  }

  const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ElevenLabs STT failed: ${resp.status} — ${errText}`);
  }

  const result = await resp.json();

  return {
    text: result.text ?? "",
    json: {
      words: result.words,
      language_code: result.language_code,
      language_probability: result.language_probability,
    },
    detectedLanguage: result.language_code,
    languageConfidence: result.language_probability,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function markFailed(
  admin: ReturnType<typeof getServiceClient>,
  jobId: string,
  reason: string,
) {
  await admin
    .from("transcription_jobs")
    .update({ status: "failed" })
    .eq("id", jobId);

  await auditLog(admin, jobId, "processing_failed", "system", null, { reason });
}
