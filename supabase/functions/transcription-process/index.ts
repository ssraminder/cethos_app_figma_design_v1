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
import { getGoogleAccessToken, getGoogleProjectId } from "../_shared/google-auth.ts";

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
    // Resolve the per-language fallback chain once per job (provider may be overridden
    // per language) — the chain is walked per file so each chunk gets a fresh try.
    // The chain also filters out providers whose per-request duration cap is exceeded
    // by the longest single file in this job — we don't yet split audio server-side,
    // so OpenAI/Google get dropped for hour-long inputs in favor of URL-ingest providers.
    const initialProvider = (job.provider as string | null) ?? "google";
    const sourceLangCode = await resolveSourceLangCode(admin, job);
    const longestFileDurationSec = sourceFiles.reduce(
      (acc, sf) => Math.max(acc, sf.duration ?? 0),
      0,
    );
    const { chain: providerChain, demoted } = await resolveProviderChain(
      admin,
      sourceLangCode,
      initialProvider,
      longestFileDurationSec,
    );

    if (demoted.length > 0) {
      await auditLog(admin, jobId, "providers_demoted_by_duration", "system", null, {
        longest_file_seconds: longestFileDurationSec,
        demoted,
        remaining_chain: providerChain,
      });
    }

    if (providerChain.length === 0) {
      const longestMin = Math.round(longestFileDurationSec / 60);
      const msg = `No STT provider in this job's fallback chain supports a ${longestMin} min file. Split the file before upload, or pick a URL-ingest provider (Deepgram, AssemblyAI) manually.`;
      await markFailed(admin, jobId, msg);
      return jsonResponse({ success: false, error: msg }, 400);
    }

    let provider = providerChain[0];
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

        let fileTranscript: TranscriptResult | null = null;
        let lastErr: unknown = null;

        for (let attempt = 0; attempt < providerChain.length; attempt++) {
          const tryProvider = providerChain[attempt];
          try {
            fileTranscript = await callProvider(tryProvider, sf, job, admin);
            if (tryProvider !== provider) {
              const origProvider = provider;
              provider = tryProvider;
              await admin.from("transcription_jobs").update({ provider }).eq("id", jobId);
              await auditLog(admin, jobId, "provider_fallback", "system", null, {
                original: origProvider,
                fallback: tryProvider,
                file_index: fi,
                reason: lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown"),
                chain: providerChain,
              });
            }
            break;
          } catch (err) {
            lastErr = err;
            console.log(`${tryProvider} failed on file ${fi} (attempt ${attempt + 1}/${providerChain.length}):`, err);
          }
        }

        if (!fileTranscript) {
          throw lastErr ?? new Error("All providers in fallback chain failed");
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
    const STT_RATES: Record<string, number> = {
      assemblyai: 0.0025,
      openai: 0.006,
      elevenlabs: 0.007,
      deepgram: 0.0043,   // Nova-3 prerecorded
      google: 0.024,      // Chirp 2 v2 (USD/min, rounded up)
    };
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
      provider === "openai" ? "openai" :
      provider === "deepgram" ? "deepgram" :
      provider === "google" ? "google" : "unknown";

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
        model: provider === "openai" ? "gpt-4o-transcribe"
          : provider === "assemblyai" ? "universal-2"
          : provider === "elevenlabs" ? "scribe-v2"
          : provider === "deepgram" ? "nova-3"
          : provider === "google" ? "chirp_2"
          : provider,
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

// ── Per-language provider fallback chain ────────────────────────────────────

// Per-provider hard upper bounds (seconds). Files longer than this get demoted
// out of the provider's slot in the fallback chain by resolveProviderChain.
// True audio-splitting (slice file into N chunks, run STT per chunk, stitch)
// requires ffmpeg / Web Audio API which a Deno edge function can't do — that
// lands in a Phase 2 worker. For Phase 1 we route around the problem instead:
// long files go to URL-ingest providers (Deepgram, AssemblyAI) that can stream
// arbitrarily long audio natively.
const PROVIDER_DURATION_CAPS_SECONDS: Record<string, number> = {
  openai: 25 * 60,              // gpt-4o-transcribe: 25 min hard limit
  google: 60,                   // v2 sync recognize: 60 s inline (batch async = Phase 2)
  elevenlabs: 4 * 60 * 60,      // scribe-v2: ~4 h soft cap
  deepgram: 10 * 60 * 60,       // nova-3 prerecorded via URL: comfortably 10 h+
  assemblyai: 10 * 60 * 60,     // universal-2 async: 10 h+
};

function providerSupportsDuration(provider: string, durationSec: number): boolean {
  const cap = PROVIDER_DURATION_CAPS_SECONDS[provider];
  // Unknown providers: allow (don't filter on missing data)
  return cap === undefined || durationSec <= cap;
}

// Per-language fallback chains — picked by the source language code (ISO 639-1).
//
// Default primary is GOOGLE because it has the widest language catalog (100+),
// covering Cethos's heavy workload (Punjabi, Persian, Pashto, Dari, Urdu, Bengali,
// Tamil, Kurdish, etc.) — most of which Deepgram Nova-3 does NOT support. Deepgram
// only appears in chains for languages it officially supports per Deepgram docs
// (see DEEPGRAM_NOVA3_SUPPORTED below). ElevenLabs is the universal backup.
//
// Tradeoff: Google STT v2 is ~5× the per-minute cost of Deepgram, but quality plus
// language coverage is worth it for a translation agency's mix. Admins can override
// the chain per-language via app_settings.transcription_fallback_chain_by_language
// without redeploying.
const DEFAULT_FALLBACK_CHAINS: Record<string, string[]> = {
  // English + Western European — Deepgram fronts (strong on these), Google backs
  en: ["deepgram", "elevenlabs", "google"],
  fr: ["deepgram", "elevenlabs", "google"],
  es: ["deepgram", "elevenlabs", "google"],
  de: ["deepgram", "elevenlabs", "google"],
  it: ["deepgram", "elevenlabs", "google"],
  pt: ["deepgram", "elevenlabs", "google"],
  nl: ["deepgram", "elevenlabs", "google"],
  pl: ["deepgram", "elevenlabs", "google"],
  cs: ["deepgram", "elevenlabs", "google"],
  da: ["deepgram", "elevenlabs", "google"],
  sv: ["deepgram", "elevenlabs", "google"],
  no: ["deepgram", "elevenlabs", "google"],
  fi: ["elevenlabs", "google"],
  // Cyrillic + Greek — Deepgram supports
  ru: ["deepgram", "elevenlabs", "google"],
  uk: ["deepgram", "elevenlabs", "google"],
  el: ["deepgram", "elevenlabs", "google"],
  bg: ["deepgram", "elevenlabs", "google"],
  // Indic / RTL — Deepgram supports Hindi + Arabic, ElevenLabs typically better
  hi: ["elevenlabs", "deepgram", "google"],
  ar: ["elevenlabs", "deepgram", "google"],
  // Deepgram does NOT support these — skip it entirely
  pa: ["google", "elevenlabs"],          // Punjabi
  ur: ["google", "elevenlabs"],          // Urdu
  fa: ["google", "elevenlabs"],          // Persian / Farsi
  ps: ["google", "elevenlabs"],          // Pashto
  prs: ["google", "elevenlabs"],         // Dari
  bn: ["google", "elevenlabs"],          // Bengali
  ta: ["google", "elevenlabs"],          // Tamil
  te: ["google", "elevenlabs"],          // Telugu
  ml: ["google", "elevenlabs"],          // Malayalam
  kn: ["google", "elevenlabs"],          // Kannada
  mr: ["google", "elevenlabs"],          // Marathi
  ne: ["google", "elevenlabs"],          // Nepali
  gu: ["google", "elevenlabs"],          // Gujarati
  si: ["google", "elevenlabs"],          // Sinhala
  ku: ["google", "elevenlabs"],          // Kurdish
  ckb: ["google", "elevenlabs"],         // Central Kurdish (Sorani)
  kmr: ["google", "elevenlabs"],         // Northern Kurdish (Kurmanji)
  am: ["google", "elevenlabs"],          // Amharic
  ti: ["google", "elevenlabs"],          // Tigrinya
  so: ["google", "elevenlabs"],          // Somali
  sw: ["google", "elevenlabs"],          // Swahili
  he: ["google", "elevenlabs"],          // Hebrew (Deepgram support is patchy)
  // CJK — Google + ElevenLabs both strong
  zh: ["google", "elevenlabs", "deepgram"],
  ja: ["deepgram", "elevenlabs", "google"],
  ko: ["deepgram", "elevenlabs", "google"],
  // Southeast Asian — Deepgram supports Thai/Vietnamese/Indonesian/Tagalog
  th: ["deepgram", "elevenlabs", "google"],
  vi: ["deepgram", "elevenlabs", "google"],
  id: ["deepgram", "elevenlabs", "google"],
  tl: ["deepgram", "google", "elevenlabs"],
  ms: ["deepgram", "google", "elevenlabs"],
  // Rare / niche — Google + ElevenLabs only
  km: ["google", "elevenlabs"],          // Khmer
  lo: ["google", "elevenlabs"],          // Lao
  my: ["google", "elevenlabs"],          // Burmese
  ka: ["google", "elevenlabs"],          // Georgian
  hy: ["google", "elevenlabs"],          // Armenian
  // Auto-detect / unmapped — Google has the widest catalog so it leads
  default: ["google", "elevenlabs"],
};

// Languages Deepgram Nova-3 officially supports (per Deepgram docs, May 2026).
// Defensive filter applied even when the configured chain mentions deepgram —
// avoids burning a request on a language we know will return empty/error.
const DEEPGRAM_NOVA3_SUPPORTED = new Set([
  "bg", "ca", "zh", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el",
  "hi", "hu", "id", "it", "ja", "ko", "lv", "lt", "ms", "no", "pl", "pt",
  "ro", "ru", "sk", "es", "sv", "th", "tr", "uk", "vi", "ar", "he", "tl",
]);

function providerSupportsLanguage(provider: string, langCode: string | null): boolean {
  if (!langCode) return true;  // unknown lang — let the provider try (auto-detect)
  if (provider === "deepgram") return DEEPGRAM_NOVA3_SUPPORTED.has(langCode);
  // ElevenLabs (99+), Google (100+), AssemblyAI (50+), OpenAI (99+) — broad coverage;
  // trust the provider to error if a specific language isn't supported.
  return true;
}

async function resolveSourceLangCode(
  admin: ReturnType<typeof getServiceClient>,
  job: Record<string, unknown>,
): Promise<string | null> {
  if (!job.source_language_id) return null;
  const { data: lang } = await admin
    .from("languages")
    .select("code")
    .eq("id", job.source_language_id)
    .maybeSingle();
  return lang?.code?.toLowerCase().split("-")[0] ?? null;
}

async function resolveProviderChain(
  admin: ReturnType<typeof getServiceClient>,
  langCode: string | null,
  customerPickedPrimary: string,
  durationSec: number = 0,
): Promise<{ chain: string[]; demoted: Array<{ provider: string; cap_seconds: number }> }> {
  // app_settings.transcription_fallback_chain_by_language is an optional JSON
  // override. Shape: { "en": ["deepgram","elevenlabs"], "default": [...] }
  let overrideMap: Record<string, string[]> = {};
  try {
    const { data: setting } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "transcription_fallback_chain_by_language")
      .maybeSingle();
    if (setting?.setting_value) {
      const parsed = typeof setting.setting_value === "string"
        ? JSON.parse(setting.setting_value)
        : setting.setting_value;
      if (parsed && typeof parsed === "object") overrideMap = parsed as Record<string, string[]>;
    }
  } catch {
    // ignore — fall back to hard-coded defaults
  }

  const chains = { ...DEFAULT_FALLBACK_CHAINS, ...overrideMap };
  const fromLang = langCode ? chains[langCode] : null;
  const baseChain = fromLang ?? chains.default ?? ["deepgram", "elevenlabs"];

  // Honor customer/admin pick by putting it at the front (unique-merge with the chain).
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const p of [customerPickedPrimary, ...baseChain]) {
    if (!seen.has(p)) {
      merged.push(p);
      seen.add(p);
    }
  }

  // Filter providers: (a) duration cap, (b) language support. Demoted providers
  // are recorded with the reason so the audit log can explain "why didn't we
  // try OpenAI on this 3-hour file?" or "why was Deepgram skipped for Punjabi?".
  const demoted: Array<{ provider: string; reason: string; cap_seconds?: number }> = [];
  const chain: string[] = [];
  for (const p of merged) {
    if (durationSec > 0 && !providerSupportsDuration(p, durationSec)) {
      demoted.push({
        provider: p,
        reason: "duration_exceeds_provider_cap",
        cap_seconds: PROVIDER_DURATION_CAPS_SECONDS[p] ?? 0,
      });
      continue;
    }
    if (!providerSupportsLanguage(p, langCode)) {
      demoted.push({
        provider: p,
        reason: `language_not_supported (${langCode})`,
      });
      continue;
    }
    chain.push(p);
  }

  return { chain, demoted };
}

async function callProvider(
  providerName: string,
  sf: { name: string; path: string; size: number; duration: number; format: string },
  job: Record<string, unknown>,
  admin: ReturnType<typeof getServiceClient>,
): Promise<TranscriptResult> {
  const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
  const fileJob = { ...job, file_format: sf.format };

  // URL-ingest providers: AssemblyAI, Deepgram (Phase 1) — no edge-function download.
  if (providerName === "assemblyai" || providerName === "deepgram") {
    const { data: signedUrlData, error: urlErr } = await admin.storage
      .from("transcription-uploads")
      .createSignedUrl(sf.path, 3600);
    if (urlErr || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL for ${sf.name}`);
    }
    return providerName === "assemblyai"
      ? transcribeAssemblyAi(signedUrlData.signedUrl, fileJob)
      : transcribeDeepgram(signedUrlData.signedUrl, fileJob);
  }

  // Download-required providers: OpenAI, ElevenLabs, Google (Phase 1 sync recognize).
  if (sf.size > MAX_DOWNLOAD_BYTES) {
    throw new Error(`File too large for ${providerName}: ${sf.name} (${(sf.size / 1024 / 1024).toFixed(0)} MB)`);
  }
  const { data: fileData, error: dlErr } = await admin.storage
    .from("transcription-uploads")
    .download(sf.path);
  if (dlErr || !fileData) {
    throw new Error(`Failed to download ${sf.name}`);
  }

  if (providerName === "openai") return transcribeOpenAi(fileData, fileJob);
  if (providerName === "elevenlabs") return transcribeElevenLabs(fileData, fileJob);
  if (providerName === "google") return transcribeGoogle(fileData, fileJob);
  throw new Error(`Unknown provider: ${providerName}`);
}

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

// ── Deepgram (Nova-3) ────────────────────────────────────────────────────────

async function transcribeDeepgram(
  audioUrl: string,
  job: Record<string, unknown>,
): Promise<TranscriptResult> {
  const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    diarize: "true",
    utterances: "true",
    punctuate: "true",
    detect_language: "true",
  });

  if (job.source_language_id) {
    const admin = getServiceClient();
    const { data: lang } = await admin
      .from("languages")
      .select("code")
      .eq("id", job.source_language_id)
      .maybeSingle();
    if (lang?.code) {
      params.set("language", lang.code);
      params.delete("detect_language");
    }
  }

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Deepgram STT failed: ${resp.status} — ${errText}`);
  }

  const result = await resp.json();
  const channel = result?.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  const text = alt?.transcript ?? "";
  const words = alt?.words ?? [];
  const utterances = result?.results?.utterances ?? [];
  const detected = channel?.detected_language ?? result?.metadata?.detected_language ?? null;
  const confidence = alt?.confidence ?? null;
  const requestId = result?.metadata?.request_id ?? null;

  // Normalize Deepgram utterances to AssemblyAI-shape so Branch 1 of
  // normalizeToSegments picks them up cleanly. Times stay in seconds —
  // transcript-segments.ts toMs() with "s" hint handles it.
  const utterancesNormalized = utterances.map((u: Record<string, unknown>) => ({
    speaker: u.speaker,
    text: u.transcript,
    start: u.start,
    end: u.end,
    words: (u.words as Array<Record<string, unknown>> | undefined)?.map((w) => ({
      text: w.punctuated_word ?? w.word,
      speaker: w.speaker,
      start: w.start,
      end: w.end,
      type: "text",
    })),
  }));

  return {
    text,
    json: {
      utterances: utterancesNormalized,
      words: words.map((w: Record<string, unknown>) => ({
        text: w.punctuated_word ?? w.word,
        speaker: w.speaker,
        start: w.start,
        end: w.end,
        type: "text",
      })),
    },
    detectedLanguage: detected,
    languageConfidence: confidence,
    providerJobId: requestId,
  };
}

// Map Cethos-internal language codes to the nearest Google STT v2 BCP-47 code.
// For variants Google doesn't officially support (Badini, Kurmanji, etc.) we
// fall back to the closest documented variant so the request succeeds; quality
// on those variants is best-effort.
function mapToGoogleBCP47(code: string): string {
  const lower = code.toLowerCase();
  // Kurdish variants — Google only documents Sorani via the Chirp model;
  // route all Kurdish dialects to ckb-IQ so the multilingual model attempts
  // recognition. Audit log records the original code separately.
  if (lower === "kmr-badini" || lower === "kmr" || lower === "ku" || lower === "ckb") {
    return "ckb-IQ";
  }
  // Persian variants (Dari, Iranian Persian, Pashto) — Persian core code is fa.
  if (lower === "prs") return "fa-AF";
  // Indic short codes — leave as-is; Google accepts en, hi, pa, etc. and resolves.
  // Already-BCP-47 codes (en-US, fr-FR) — pass through.
  return code;
}

// ── Google Speech-to-Text v2 ─────────────────────────────────────────────────
// Phase 1: synchronous recognize endpoint, API-key auth, audio ≤ 60s per request
// (long-audio chunking lands in PR #2). Beyond 60s, the per-language fallback
// chain will route Google requests away to Deepgram or ElevenLabs.

async function transcribeGoogle(
  audioBlob: Blob,
  job: Record<string, unknown>,
): Promise<TranscriptResult> {
  // Auth: service-account JWT exchange (same pattern as ocr-process-next).
  // Reuses GOOGLE_APPLICATION_CREDENTIALS_JSON + GOOGLE_CLOUD_PROJECT already
  // set for Document AI — no new secrets required for STT.
  const accessToken = await getGoogleAccessToken();
  const projectId = getGoogleProjectId();

  // Determine language codes. Google v2 / Chirp 2 supports multi-language
  // recognition ("code-switching") by passing multiple BCP-47 codes — we use
  // this for bilingual audio. The primary source_language_id is always first;
  // additional_language_ids (when set) are appended. If neither is set we
  // pass "auto" and let Chirp 2 detect.
  //
  // Code mapping: some entries in `languages` use Cethos-internal codes that
  // aren't in Google's catalog (e.g. kmr-badini for Badini Kurdish). We map
  // those to the closest documented Google STT v2 code via mapToGoogleBCP47
  // so the request doesn't 400 — quality on the unsupported variant is best-
  // effort and may come back as the closest mapped language.
  let languageCodes: string[] = ["auto"];
  const allLangIds: string[] = [
    ...(job.source_language_id ? [job.source_language_id as string] : []),
    ...((job.additional_language_ids as string[] | null) ?? []),
  ];
  if (allLangIds.length > 0) {
    const admin = getServiceClient();
    const { data: langs } = await admin
      .from("languages")
      .select("id, code")
      .in("id", allLangIds);
    // Preserve the order: primary first, then additionals in the order
    // declared on the job. langs[] from PostgREST may be unordered.
    const codeById = new Map<string, string>();
    for (const l of langs ?? []) {
      if (l.code) codeById.set(l.id as string, mapToGoogleBCP47(l.code as string));
    }
    const ordered: string[] = [];
    for (const id of allLangIds) {
      const code = codeById.get(id);
      if (code && !ordered.includes(code)) ordered.push(code);
    }
    if (ordered.length > 0) languageCodes = ordered;
  }

  // Convert audio to base64 for inline content (v2 sync supports up to ~1 minute / 10 MB).
  const audioBytes = new Uint8Array(await audioBlob.arrayBuffer());
  if (audioBytes.length > 10 * 1024 * 1024) {
    throw new Error("Google STT v2 sync recognize limit is 10 MB; longer audio routes through chunking (PR #2)");
  }
  // btoa in chunks to avoid stack overflow on large arrays.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < audioBytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(audioBytes.subarray(i, i + CHUNK)));
  }
  const audioBase64 = btoa(binary);

  const body = {
    config: {
      autoDecodingConfig: {},
      languageCodes,
      model: "chirp_2",
      features: {
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        enableWordConfidence: true,
        diarizationConfig: {
          minSpeakerCount: 1,
          maxSpeakerCount: 6,
        },
      },
    },
    content: audioBase64,
  };

  const url = `https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    // Most common cause on first run: Speech-to-Text API not enabled on the project.
    if (resp.status === 403 && /Speech-to-Text|speech\.googleapis\.com|SERVICE_DISABLED/i.test(errText)) {
      throw new Error(
        `Google STT v2: Cloud Speech-to-Text API is not enabled on project ${projectId}. Enable it at https://console.cloud.google.com/apis/library/speech.googleapis.com — original error: ${errText.slice(0, 300)}`,
      );
    }
    throw new Error(`Google STT v2 failed: ${resp.status} — ${errText}`);
  }

  const result = await resp.json();
  const results = (result?.results ?? []) as Array<Record<string, unknown>>;

  // Stitch alternatives across result chunks into a single transcript + word stream.
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

  return {
    text: fullText.join(" ").trim(),
    json: {
      words: allWords,
      language_code: detectedLanguage,
    },
    detectedLanguage: detectedLanguage ?? undefined,
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
