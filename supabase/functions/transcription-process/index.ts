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

    if (job.status !== "processing" && job.status !== "pending") {
      return jsonResponse({
        success: false,
        error: `Job status is '${job.status}', expected 'processing' or 'pending'`,
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

    // ── Download audio from storage ──────────────────────────────────────

    const { data: fileData, error: dlErr } = await admin.storage
      .from("transcription-uploads")
      .download(job.file_path);

    if (dlErr || !fileData) {
      console.error("Storage download failed:", dlErr);
      await markFailed(admin, jobId, "Failed to download audio file");
      return jsonResponse({ success: false, error: "File download failed" }, 500);
    }

    // ── Call STT provider ────────────────────────────────────────────────

    let transcript: TranscriptResult;
    const provider = job.provider ?? "assemblyai";

    try {
      if (provider === "assemblyai") {
        transcript = await transcribeAssemblyAi(fileData, job);
      } else if (provider === "openai") {
        transcript = await transcribeOpenAi(fileData, job);
      } else if (provider === "elevenlabs") {
        transcript = await transcribeElevenLabs(fileData, job);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
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
  audioBlob: Blob,
  job: Record<string, unknown>,
): Promise<TranscriptResult> {
  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not configured");

  // 1. Upload audio
  const uploadResp = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: apiKey },
    body: audioBlob,
  });

  if (!uploadResp.ok) {
    throw new Error(`AssemblyAI upload failed: ${uploadResp.status}`);
  }

  const { upload_url } = await uploadResp.json();

  // 2. Create transcript request
  const transcriptBody: Record<string, unknown> = {
    audio_url: upload_url,
    language_detection: true,
  };

  // If source language specified, set it
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

  // gpt-4o-transcribe returns { text, logprobs } with json format
  // Try to detect language from the transcript text using a quick heuristic,
  // or fall back to calling the model. For now, store raw result and let
  // the AI quality check identify the language.
  // Also try a second call with verbose_json on whisper-1 for language detection
  // if the primary model doesn't provide it.
  let detectedLang: string | undefined;

  // Quick language detection: make a lightweight whisper-1 call just for language
  try {
    const langForm = new FormData();
    langForm.append("file", new File([audioBlob], `audio.${ext}`, { type: audioBlob.type || "audio/mpeg" }));
    langForm.append("model", "whisper-1");
    langForm.append("response_format", "verbose_json");
    // Only need first few seconds for language detection
    const langResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: langForm,
    });
    if (langResp.ok) {
      const langResult = await langResp.json();
      detectedLang = langResult.language;
    }
  } catch {
    // Language detection is best-effort
  }

  return {
    text: result.text ?? "",
    json: {
      logprobs: result.logprobs,
    },
    detectedLanguage: detectedLang,
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
