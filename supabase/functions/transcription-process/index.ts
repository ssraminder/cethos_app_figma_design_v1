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
import {
  type Segment,
  type ProviderHint,
  normalizeToSegments,
  buildTranscriptJsonV2,
  mergeReprocessedSegments,
  readSegments,
  denormalizeText,
  TRANSCRIPT_FORMAT_VERSION,
} from "../_shared/transcript-segments.ts";

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

    // ── Determine files to process ─────────────────────────────────────
    // Multi-file jobs have source_files JSONB array; single-file jobs use file_path.

    interface SourceFile {
      name: string;
      path: string;
      size: number;
      duration: number;
      format: string;
      transcript_text?: string;
      transcript_json?: unknown;
      translated_text?: string;
    }

    const sourceFiles: SourceFile[] = (job.source_files as SourceFile[] | null)?.length
      ? (job.source_files as SourceFile[])
      : [{
          name: job.file_name as string,
          path: job.file_path as string,
          size: (job.file_size_bytes as number) ?? 0,
          duration: (job.file_duration_seconds as number) ?? 0,
          format: (job.file_format as string) ?? "mp3",
        }];

    // ── Call STT provider (per file, then merge) ────────────────────────
    const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

    let provider = job.provider ?? "openai";
    const allTranscripts: TranscriptResult[] = [];
    let timeOffsetMs = 0;

    try {
      for (let fi = 0; fi < sourceFiles.length; fi++) {
        const sf = sourceFiles[fi];
        if (sourceFiles.length > 1) {
          await auditLog(admin, jobId, "processing_file", "system", null, {
            file_index: fi,
            file_name: sf.name,
            total_files: sourceFiles.length,
          });
        }

        let fileTranscript: TranscriptResult;

        if (provider === "assemblyai") {
          const { data: signedUrlData, error: urlErr } = await admin.storage
            .from("transcription-uploads")
            .createSignedUrl(sf.path, 3600);
          if (urlErr || !signedUrlData?.signedUrl) {
            throw new Error(`Failed to create signed URL for ${sf.name}`);
          }
          fileTranscript = await transcribeAssemblyAi(signedUrlData.signedUrl, job);
        } else {
          if (sf.size > MAX_DOWNLOAD_BYTES) {
            await markFailed(admin, jobId, `File too large: ${sf.name} (${(sf.size / 1024 / 1024).toFixed(0)} MB). Extract audio first.`);
            return jsonResponse({ success: false, error: "File too large" }, 400);
          }

          const { data: fileData, error: dlErr } = await admin.storage
            .from("transcription-uploads")
            .download(sf.path);
          if (dlErr || !fileData) {
            throw new Error(`Failed to download ${sf.name}`);
          }

          const fileJob = { ...job, file_format: sf.format };

          try {
            if (provider === "openai") {
              fileTranscript = await transcribeOpenAi(fileData, fileJob);
            } else {
              fileTranscript = await transcribeElevenLabs(fileData, fileJob);
            }
          } catch (primaryErr) {
            if (provider !== "elevenlabs") {
              console.log(`${provider} failed on file ${fi}, falling back to ElevenLabs:`, primaryErr);
              const origProvider = provider;
              provider = "elevenlabs";
              await admin.from("transcription_jobs").update({ provider }).eq("id", jobId);
              await auditLog(admin, jobId, "provider_fallback", "system", null, {
                original: origProvider,
                fallback: "elevenlabs",
                reason: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
              });
              fileTranscript = await transcribeElevenLabs(fileData, fileJob);
            } else {
              throw primaryErr;
            }
          }
        }

        // Offset timestamps for multi-file jobs so they form a continuous timeline
        if (sourceFiles.length > 1 && timeOffsetMs > 0 && fileTranscript.json) {
          offsetTimestamps(fileTranscript.json, timeOffsetMs);
        }

        // Save per-file transcript into source_files entry for per-file output
        if (sourceFiles.length > 1) {
          sourceFiles[fi].transcript_text = fileTranscript.text;
          sourceFiles[fi].transcript_json = fileTranscript.json;
        }

        allTranscripts.push(fileTranscript);
        timeOffsetMs += sf.duration * 1000;
      }
    } catch (e) {
      console.error(`STT (${provider}) failed for ${jobId}:`, e);
      await markFailed(admin, jobId, `Transcription failed: ${e instanceof Error ? e.message : String(e)}`);
      return jsonResponse({ success: false, error: "Transcription failed" }, 500);
    }

    // Merge transcripts from all files (legacy raw shape — passed to script conv)
    const transcript = mergeTranscripts(allTranscripts);

    // Estimate STT provider cost based on duration
    const totalDurationMin = sourceFiles.reduce((acc, sf) => acc + (sf.duration / 60), 0);
    const STT_RATES: Record<string, number> = { assemblyai: 0.0025, openai: 0.006, elevenlabs: 0.007 };
    const sttCost = totalDurationMin * (STT_RATES[provider] ?? 0.006);

    // ── Script enforcement (in-memory; mutates `transcript` before v2 normalize) ──
    // If a source language is set and the transcript came back in the wrong script,
    // we ask Claude to transliterate the combined text + word-level json in place.
    // Result feeds the v2 normalization below — single persist at the end.
    let scriptConvCost = 0;
    if (job.source_language_id && transcript.text.trim()) {
      const { data: srcLang } = await admin
        .from("languages")
        .select("code, name, native_name")
        .eq("id", job.source_language_id)
        .maybeSingle();

      if (srcLang?.code) {
        const expected = LANG_EXPECTED_SCRIPT[srcLang.code];
        if (expected) {
          const dominant = detectDominantScript(transcript.text);
          if (dominant && dominant !== expected.script) {
            console.log(`Script mismatch: expected ${expected.script}, got ${dominant}. Converting...`);
            await auditLog(admin, jobId, "script_mismatch_detected", "system", null, {
              expected: expected.script,
              detected: dominant,
              language: srcLang.name,
            });

            const converted = await convertScript(
              transcript.text,
              srcLang.name,
              srcLang.native_name ?? srcLang.name,
              expected.label,
            );

            if (converted.text) {
              scriptConvCost += converted.cost;
              transcript.text = converted.text;
              if (transcript.json) {
                const jsonConverted = await convertJsonWordTexts(
                  transcript.json as Record<string, unknown>,
                  srcLang.name,
                  srcLang.native_name ?? srcLang.name,
                  expected.label,
                );
                if (jsonConverted.json) {
                  transcript.json = jsonConverted.json;
                  scriptConvCost += jsonConverted.cost;
                }
              }
              await auditLog(admin, jobId, "script_converted", "system", null, {
                from_script: dominant,
                to_script: expected.script,
                cost: scriptConvCost.toFixed(6),
              });
            }
          }
        }
      }
    }

    // ── Normalize STT output to canonical v2 segments ──────────────────────
    const providerHint: ProviderHint =
      provider === "assemblyai" ? "assemblyai" :
      provider === "elevenlabs" ? "elevenlabs" :
      provider === "openai" ? "openai" : "unknown";

    const isReprocess = !!job.transcript_text?.trim();

    // For reprocess: load prior active version segments, keyed by file_index
    const priorSegmentsByFile = new Map<number | null, Segment[]>();
    if (isReprocess) {
      const { data: priorVersions } = await admin
        .from("transcription_versions")
        .select("file_index, transcript_json")
        .eq("job_id", jobId)
        .eq("is_active", true);
      for (const v of priorVersions ?? []) {
        const segs = await readSegments(v.transcript_json);
        priorSegmentsByFile.set((v.file_index as number | null) ?? null, segs);
      }
    }

    type MergeStat = { preserved: number; added: number; reused_translations: number };
    const mergeStats: Array<{ file_index: number | null } & MergeStat> = [];

    // Per-file: normalize, merge with prior if reprocess, write v2 source_files entries
    const perFileSegments: Segment[][] = [];
    for (let fi = 0; fi < sourceFiles.length; fi++) {
      const rawJson = sourceFiles.length > 1
        ? sourceFiles[fi].transcript_json as unknown
        : transcript.json;
      let newSegs = await normalizeToSegments(rawJson, {
        provider: providerHint,
        idStrategy: "random",
      });
      const key = sourceFiles.length > 1 ? fi : null;
      const prior = priorSegmentsByFile.get(key);
      if (prior && prior.length > 0) {
        const { segments: merged, summary } = mergeReprocessedSegments(prior, newSegs);
        newSegs = merged;
        mergeStats.push({ file_index: key, ...summary });
      }
      perFileSegments.push(newSegs);

      if (sourceFiles.length > 1) {
        const fileV2 = buildTranscriptJsonV2(newSegs, {
          provider,
          language_code: transcript.detectedLanguage,
          audio_duration: sourceFiles[fi].duration,
        });
        sourceFiles[fi].transcript_json = fileV2;
        sourceFiles[fi].transcript_text = denormalizeText(newSegs);
      }
    }

    // Combined v2 segments (concat per-file for multi; single for solo)
    const combinedSegments: Segment[] = sourceFiles.length > 1
      ? perFileSegments.flat()
      : perFileSegments[0] ?? [];
    const combinedV2 = buildTranscriptJsonV2(combinedSegments, {
      provider,
      language_code: transcript.detectedLanguage,
      language_probability: transcript.languageConfidence,
    });
    const combinedText = denormalizeText(combinedSegments) || transcript.text;
    const wordCount = combinedText.split(/\s+/).filter(Boolean).length;

    // Persist source_files (multi-file)
    if (sourceFiles.length > 1) {
      const { error: sfErr } = await admin
        .from("transcription_jobs")
        .update({ source_files: sourceFiles })
        .eq("id", jobId);
      if (sfErr) console.error("source_files update failed:", sfErr);
    }

    // ── Single persist: deactivate prior, insert new version, update job ──
    if (isReprocess) {
      await admin
        .from("transcription_versions")
        .update({ is_active: false })
        .eq("job_id", jobId)
        .eq("is_active", true);
    }

    const { error: versionErr } = await admin
      .from("transcription_versions")
      .insert({
        job_id: jobId,
        version_type: isReprocess ? "reprocess" : "original",
        provider,
        model: provider === "openai" ? "gpt-4o-transcribe" : provider === "assemblyai" ? "universal-2" : "scribe-v2",
        transcript_text: combinedText,
        transcript_json: combinedV2,
        transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
        word_count: wordCount,
        cost: sttCost + scriptConvCost,
        is_active: true,
      });
    if (versionErr) {
      console.error("Version insert failed:", versionErr);
      await markFailed(admin, jobId, "Failed to save version");
      return jsonResponse({ success: false, error: "Failed to save version" }, 500);
    }

    const prevCost = (job.ai_total_cost as number) ?? 0;
    const newTotalCost = prevCost + sttCost + scriptConvCost;

    const { error: updateErr } = await admin
      .from("transcription_jobs")
      .update({
        transcript_text: combinedText,
        transcript_json: combinedV2,
        transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
        detected_language: transcript.detectedLanguage ?? null,
        language_confidence: transcript.languageConfidence ?? null,
        word_count: wordCount,
        provider_job_id: transcript.providerJobId ?? null,
        provider_cost: sttCost,
        ai_total_cost: newTotalCost,
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
      segment_count: combinedSegments.length,
      detected_language: transcript.detectedLanguage,
      stt_cost: sttCost.toFixed(6),
      script_conv_cost: scriptConvCost.toFixed(6),
      reprocess: isReprocess,
      merge_stats: mergeStats.length > 0 ? mergeStats : undefined,
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

    // ── Chain: AI translation (if requested) — blocking ────────────────

    if (job.translation_requested && job.translation_target_language_id) {
      try {
        const translateResp = await fetch(`${supabaseUrl}/functions/v1/transcription-ai-translate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ job_id: jobId }),
        });
        const translateResult = await translateResp.json();
        if (!translateResult.success) {
          console.error("Translation failed:", translateResult.error);
          await auditLog(admin, jobId, "translation_skipped", "system", null, {
            reason: translateResult.error,
          });
        }
      } catch (e) {
        console.error("Translation error:", e);
      }
    }

    // ── Chain: delivery (translation is done or skipped) ────────────────

    fetch(`${supabaseUrl}/functions/v1/transcription-deliver`, {
      method: "POST",
      headers,
      body: JSON.stringify({ job_id: jobId }),
    }).catch((e) => console.error("Failed to trigger delivery:", e));

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
    speaker_labels: true,
  };

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("code")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.code) {
      transcriptBody.language_code = lang.code;
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

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("code, name, native_name")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.name) {
      form.append("prompt", `This audio is in ${lang.name}${lang.native_name ? ` (${lang.native_name})` : ""}. Transcribe using the native script for ${lang.name}.`);
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

  // gpt-4o-transcribe with "json" returns { text, logprobs? }
  // No word/segment timestamps — build a single segment from duration if available
  const durationSec = (job.file_duration_seconds as number) ?? 0;

  return {
    text: result.text ?? "",
    json: {
      segments: [{
        text: (result.text ?? "").trim(),
        start: 0,
        end: Math.round(durationSec * 1000),
      }],
    },
    detectedLanguage: result.language,
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
  form.append("diarize", "true");

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("code")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.code) {
      form.append("language_code", lang.code);
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

// ── Multi-file helpers ──────────────────────────────────────────────────────

function offsetTimestamps(json: Record<string, unknown>, offsetMs: number) {
  // Detect timestamp units: ElevenLabs uses seconds, AssemblyAI/OpenAI use milliseconds.
  // If max timestamp < 100000, timestamps are in seconds — convert offset to seconds too.
  const words = json.words as Array<Record<string, unknown>> | undefined;
  const segments = json.segments as Array<Record<string, unknown>> | undefined;
  const utterances = json.utterances as Array<Record<string, unknown>> | undefined;

  let maxTs = 0;
  for (const arr of [words, segments, utterances]) {
    if (arr) {
      for (const item of arr) {
        if (typeof item.end === "number" && item.end > maxTs) maxTs = item.end;
      }
    }
  }
  const isSeconds = maxTs > 0 && maxTs < 100000;
  const offset = isSeconds ? offsetMs / 1000 : offsetMs;

  if (words) {
    for (const w of words) {
      if (typeof w.start === "number") w.start = w.start + offset;
      if (typeof w.end === "number") w.end = w.end + offset;
    }
  }
  if (segments) {
    for (const s of segments) {
      if (typeof s.start === "number") s.start = s.start + offset;
      if (typeof s.end === "number") s.end = s.end + offset;
    }
  }
  if (utterances) {
    for (const u of utterances) {
      if (typeof u.start === "number") u.start = u.start + offset;
      if (typeof u.end === "number") u.end = u.end + offset;
    }
  }
}

function mergeTranscripts(results: TranscriptResult[]): TranscriptResult {
  if (results.length === 1) return results[0];

  const texts: string[] = [];
  const allWords: unknown[] = [];
  const allSegments: unknown[] = [];
  const allUtterances: unknown[] = [];
  let detectedLanguage: string | undefined;
  let languageConfidence: number | undefined;

  for (const r of results) {
    texts.push(r.text);
    if (!detectedLanguage && r.detectedLanguage) {
      detectedLanguage = r.detectedLanguage;
      languageConfidence = r.languageConfidence;
    }
    if (r.json) {
      const w = r.json.words as unknown[] | undefined;
      if (w) allWords.push(...w);
      const s = r.json.segments as unknown[] | undefined;
      if (s) allSegments.push(...s);
      const u = r.json.utterances as unknown[] | undefined;
      if (u) allUtterances.push(...u);
    }
  }

  return {
    text: texts.join("\n\n"),
    json: {
      ...(allWords.length > 0 ? { words: allWords } : {}),
      ...(allSegments.length > 0 ? { segments: allSegments } : {}),
      ...(allUtterances.length > 0 ? { utterances: allUtterances } : {}),
    },
    detectedLanguage,
    languageConfidence,
  };
}

// ── Script enforcement helpers ──────────────────────────────────────────────

interface ScriptInfo {
  script: string;
  label: string;
  range: [number, number];
}

const SCRIPT_RANGES: Record<string, [number, number]> = {
  gurmukhi:   [0x0A00, 0x0A7F],
  devanagari: [0x0900, 0x097F],
  arabic:     [0x0600, 0x06FF],
  bengali:    [0x0980, 0x09FF],
  tamil:      [0x0B80, 0x0BFF],
  telugu:     [0x0C00, 0x0C7F],
  kannada:    [0x0C80, 0x0CFF],
  malayalam:  [0x0D00, 0x0D7F],
  thai:       [0x0E00, 0x0E7F],
  georgian:   [0x10A0, 0x10FF],
  cyrillic:   [0x0400, 0x04FF],
  greek:      [0x0370, 0x03FF],
  hangul:     [0xAC00, 0xD7AF],
  hiragana:   [0x3040, 0x309F],
  katakana:   [0x30A0, 0x30FF],
  cjk:        [0x4E00, 0x9FFF],
};

const LANG_EXPECTED_SCRIPT: Record<string, ScriptInfo> = {
  pa: { script: "gurmukhi",   label: "Gurmukhi (ਪੰਜਾਬੀ)",   range: SCRIPT_RANGES.gurmukhi },
  hi: { script: "devanagari", label: "Devanagari (हिन्दी)",    range: SCRIPT_RANGES.devanagari },
  mr: { script: "devanagari", label: "Devanagari (मराठी)",     range: SCRIPT_RANGES.devanagari },
  ne: { script: "devanagari", label: "Devanagari (नेपाली)",    range: SCRIPT_RANGES.devanagari },
  bn: { script: "bengali",    label: "Bengali (বাংলা)",       range: SCRIPT_RANGES.bengali },
  ta: { script: "tamil",      label: "Tamil (தமிழ்)",         range: SCRIPT_RANGES.tamil },
  te: { script: "telugu",     label: "Telugu (తెలుగు)",       range: SCRIPT_RANGES.telugu },
  kn: { script: "kannada",    label: "Kannada (ಕನ್ನಡ)",       range: SCRIPT_RANGES.kannada },
  ml: { script: "malayalam",  label: "Malayalam (മലയാളം)",   range: SCRIPT_RANGES.malayalam },
  ur: { script: "arabic",     label: "Arabic/Nastaliq (اردو)", range: SCRIPT_RANGES.arabic },
  ar: { script: "arabic",     label: "Arabic (العربية)",       range: SCRIPT_RANGES.arabic },
  fa: { script: "arabic",     label: "Arabic/Persian (فارسی)", range: SCRIPT_RANGES.arabic },
  th: { script: "thai",       label: "Thai (ไทย)",            range: SCRIPT_RANGES.thai },
  ka: { script: "georgian",   label: "Georgian (ქართული)",    range: SCRIPT_RANGES.georgian },
  ru: { script: "cyrillic",   label: "Cyrillic (Русский)",     range: SCRIPT_RANGES.cyrillic },
  uk: { script: "cyrillic",   label: "Cyrillic (Українська)",  range: SCRIPT_RANGES.cyrillic },
  el: { script: "greek",      label: "Greek (Ελληνικά)",       range: SCRIPT_RANGES.greek },
  ko: { script: "hangul",     label: "Hangul (한국어)",         range: SCRIPT_RANGES.hangul },
  ja: { script: "hiragana",   label: "Japanese (日本語)",       range: SCRIPT_RANGES.hiragana },
  zh: { script: "cjk",        label: "CJK (中文)",             range: SCRIPT_RANGES.cjk },
};

function detectDominantScript(text: string): string | null {
  const counts: Record<string, number> = {};
  let totalScripted = 0;

  for (const char of text) {
    const cp = char.codePointAt(0)!;
    // Skip Latin (A-Z, a-z, extended), digits, punctuation, whitespace
    if (cp <= 0x024F || (cp >= 0x2000 && cp <= 0x206F)) continue;

    for (const [name, [lo, hi]] of Object.entries(SCRIPT_RANGES)) {
      if (cp >= lo && cp <= hi) {
        counts[name] = (counts[name] ?? 0) + 1;
        totalScripted++;
        break;
      }
    }
  }

  if (totalScripted < 5) return null; // too few non-Latin chars to judge

  let best = "";
  let bestCount = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > bestCount) { best = name; bestCount = count; }
  }

  return bestCount > totalScripted * 0.5 ? best : null;
}

async function convertScript(
  text: string,
  langName: string,
  nativeName: string,
  targetScriptLabel: string,
): Promise<{ text: string; cost: number }> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return { text: "", cost: 0 };

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `Convert this transcript to the correct script for ${langName} (${nativeName}).
The output must be in ${targetScriptLabel} script.

Rules:
- Transliterate all text to the ${targetScriptLabel} script
- Keep common English words as-is (hello, okay, brother, thank you, sorry, please, etc.)
- Keep speaker labels exactly as they are (e.g., "Speaker 1:")
- Keep timestamps exactly as they are
- Do NOT translate — this is the same language, just convert the script
- Do NOT add any notes or explanations
- Output ONLY the converted transcript

Transcript:
${text}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("Script conversion failed:", resp.status);
      return { text: "", cost: 0 };
    }

    const result = await resp.json();
    const converted = result.content?.[0]?.text ?? "";
    const inTok = result.usage?.input_tokens ?? 0;
    const outTok = result.usage?.output_tokens ?? 0;
    // Sonnet pricing
    const cost = (inTok * 3 + outTok * 15) / 1_000_000;
    return { text: converted, cost };
  } catch (e) {
    console.error("Script conversion error:", e);
    return { text: "", cost: 0 };
  }
}

// Convert word-level texts in transcript_json to the correct script.
// Extracts all word texts, sends them as a JSON array to Claude for batch conversion,
// then updates the JSON structure in-place preserving timestamps and speaker IDs.
async function convertJsonWordTexts(
  json: Record<string, unknown>,
  langName: string,
  nativeName: string,
  targetScriptLabel: string,
): Promise<{ json: Record<string, unknown> | null; cost: number }> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return { json: null, cost: 0 };

  // Extract word texts from known JSON structures
  type WordEntry = { text: string; [key: string]: unknown };
  let wordEntries: WordEntry[] = [];
  let source: "words" | "utterances" | null = null;

  const words = json.words as WordEntry[] | undefined;
  const utterances = json.utterances as WordEntry[] | undefined;

  if (words?.length) {
    wordEntries = words.filter((w) => w.type !== "spacing" && w.text?.trim());
    source = "words";
  } else if (utterances?.length) {
    wordEntries = utterances.filter((u) => u.text?.trim());
    source = "utterances";
  }

  if (!wordEntries.length || !source) return { json: null, cost: 0 };

  const texts = wordEntries.map((w) => w.text);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `Convert these ${langName} words/phrases to ${targetScriptLabel} script.
Input is a JSON array of strings. Output ONLY a JSON array of the same length with converted strings.
Keep common English words as-is (hello, okay, brother, etc.).
Do NOT translate — just convert the script.

${JSON.stringify(texts)}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("JSON word conversion failed:", resp.status);
      return { json: null, cost: 0 };
    }

    const result = await resp.json();
    const rawText = result.content?.[0]?.text ?? "";
    const inTok = result.usage?.input_tokens ?? 0;
    const outTok = result.usage?.output_tokens ?? 0;
    const cost = (inTok * 0.25 + outTok * 1.25) / 1_000_000;

    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const converted: string[] = JSON.parse(cleaned);

    if (!Array.isArray(converted) || converted.length !== wordEntries.length) {
      console.error(`Word conversion length mismatch: expected ${wordEntries.length}, got ${converted.length}`);
      return { json: null, cost };
    }

    // Update in-place
    const updatedJson = JSON.parse(JSON.stringify(json));
    const targetArr = updatedJson[source] as WordEntry[];
    let ci = 0;
    for (const entry of targetArr) {
      if (source === "words" && entry.type === "spacing") continue;
      if (!entry.text?.trim()) continue;
      if (ci < converted.length) {
        entry.text = converted[ci];
        ci++;
      }
    }

    return { json: updatedJson, cost };
  } catch (e) {
    console.error("JSON word conversion error:", e);
    return { json: null, cost: 0 };
  }
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
