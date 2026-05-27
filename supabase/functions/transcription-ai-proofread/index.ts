// POST /functions/v1/transcription-ai-proofread
// Body: { job_id: string, model?: "haiku" | "sonnet" | "opus", file_index?: number, context?: string }
//
// V2 implementation: operates per-segment keyed by segment id. Claude only
// rewrites the text inside each segment; speaker, timestamps, and the segment
// list itself are immutable. Translations (if any) are proofread alongside and
// stored as segment.translations[targetLangCode].

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";
import {
  type Segment,
  type SegmentEdit,
  readSegments,
  applySegmentEdits,
  buildTranscriptJsonV2,
  denormalizeText,
  denormalizeTranslation,
  serializeForLLM,
  parseLLMResponse,
  wordCount,
  TRANSCRIPT_FORMAT_VERSION,
} from "../_shared/transcript-segments.ts";

const CLAUDE_MODELS: Record<string, { id: string; inputPer1M: number; outputPer1M: number }> = {
  haiku:  { id: "claude-haiku-4-5-20251001", inputPer1M: 0.25, outputPer1M: 1.25 },
  sonnet: { id: "claude-sonnet-4-6",         inputPer1M: 3,    outputPer1M: 15 },
  opus:   { id: "claude-opus-4-6",           inputPer1M: 15,   outputPer1M: 75 },
};

const LANG_META: Record<string, { name: string; script?: string }> = {
  pan: { name: "Punjabi", script: "Gurmukhi (ਪੰਜਾਬੀ)" },
  pa:  { name: "Punjabi", script: "Gurmukhi (ਪੰਜਾਬੀ)" },
  hin: { name: "Hindi", script: "Devanagari" },
  hi:  { name: "Hindi", script: "Devanagari" },
  eng: { name: "English" }, en: { name: "English" },
  fra: { name: "French" }, fr: { name: "French" },
  spa: { name: "Spanish" }, es: { name: "Spanish" },
  ara: { name: "Arabic", script: "Arabic" }, ar: { name: "Arabic", script: "Arabic" },
  urd: { name: "Urdu", script: "Nastaliq" }, ur: { name: "Urdu", script: "Nastaliq" },
  zho: { name: "Chinese", script: "Simplified Chinese" }, zh: { name: "Chinese", script: "Simplified Chinese" },
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const jobId = body?.job_id as string;
    const modelKey = (body?.model as string) ?? "sonnet";
    const fileIndex = typeof body?.file_index === "number" ? body.file_index : null;
    const externalContext = (body?.context as string) ?? "";

    if (!jobId) return jsonResponse({ success: false, error: "job_id required" }, 400);

    const modelInfo = CLAUDE_MODELS[modelKey];
    if (!modelInfo) {
      return jsonResponse({ success: false, error: `Invalid model: ${modelKey}. Use haiku, sonnet, or opus.` }, 400);
    }

    const admin = getServiceClient();
    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_text, transcript_json, transcript_format_version, translated_text, detected_language, source_language_id, translation_target_language_id, ai_total_cost, source_files")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    if (jobErr || !job) return jsonResponse({ success: false, error: "Job not found" }, 404);

    type SourceFile = { name?: string; transcript_text?: string; translated_text?: string; transcript_json?: unknown };
    const files = (job.source_files as SourceFile[]) ?? [];

    // ── Resolve target scope: per-file or whole job ────────────────────────
    let segments: Segment[];
    let sourceJson: unknown;
    if (fileIndex !== null) {
      if (fileIndex < 0 || fileIndex >= files.length) {
        return jsonResponse({ success: false, error: `Invalid file_index: ${fileIndex}` }, 400);
      }
      sourceJson = files[fileIndex].transcript_json;
    } else {
      sourceJson = job.transcript_json;
    }

    // Refuse v1 jobs — caller must run backfill first.
    const isV2 =
      sourceJson &&
      typeof sourceJson === "object" &&
      (sourceJson as { format_version?: number }).format_version === 2;
    if (!isV2) {
      return jsonResponse({
        success: false,
        error: "Job is in legacy v1 format. Run transcription-backfill-segments before proofreading.",
        code: "BACKFILL_REQUIRED",
      }, 409);
    }
    segments = await readSegments(sourceJson);

    if (segments.length === 0) {
      return jsonResponse({ success: false, error: "No segments to proofread" }, 400);
    }

    // ── Target translation language for proofread (if any) ─────────────────
    let targetLangCode: string | null = null;
    let targetLangName: string | null = null;
    if (job.translation_target_language_id) {
      const { data: lang } = await admin
        .from("languages")
        .select("name, code")
        .eq("id", job.translation_target_language_id)
        .maybeSingle();
      if (lang) {
        targetLangCode = lang.code;
        targetLangName = lang.name;
      }
    }
    const hasTranslation = !!(targetLangCode && segments.some((s) => s.translations?.[targetLangCode!]?.trim()));

    // ── Source language metadata for script enforcement ────────────────────
    let langContext = "";
    let scriptInstruction = "";
    if (job.source_language_id) {
      const { data: lang } = await admin
        .from("languages")
        .select("name, native_name, code")
        .eq("id", job.source_language_id)
        .maybeSingle();
      if (lang) {
        langContext = `Source language: ${lang.name}${lang.native_name ? ` (${lang.native_name})` : ""} [${lang.code}]`;
        const meta = LANG_META[lang.code];
        if (meta?.script) {
          scriptInstruction = `SCRIPT: source text MUST be in ${meta.script} script. If incorrect, transliterate to the correct script.`;
        }
      }
    }
    if (!langContext && job.detected_language) {
      const meta = LANG_META[job.detected_language.toLowerCase()];
      if (meta) {
        langContext = `Source language: ${meta.name}`;
        if (meta.script) {
          scriptInstruction = `SCRIPT: source text MUST be in ${meta.script} script.`;
        }
      } else {
        langContext = `Detected language: ${job.detected_language}`;
      }
    }

    // ── Cross-file context block (names/terms consistency) ─────────────────
    let contextBlock = "";
    if (externalContext) {
      contextBlock = externalContext;
    } else if (files.length > 1) {
      contextBlock = files
        .map((f, i) => {
          const text = f.transcript_text ?? "";
          const excerpt = text.length > 500 ? text.slice(0, 500) + "..." : text;
          return `File ${i + 1} (${f.name ?? "unknown"}): ${excerpt}`;
        })
        .join("\n\n");
    }

    // ── Build prompt ───────────────────────────────────────────────────────
    const knownIds = segments.map((s) => s.id);
    const serialized = serializeForLLM(segments, {
      includeTranslations: hasTranslation ? [targetLangCode!] : undefined,
    });

    const prompt = hasTranslation
      ? buildPromptWithTranslation(serialized, langContext, contextBlock, scriptInstruction, targetLangName!, targetLangCode!)
      : buildPromptSourceOnly(serialized, langContext, contextBlock, scriptInstruction);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 503);
    }

    const totalChars = serialized.length;
    const estimatedTokens = Math.ceil(totalChars / 3);
    const maxTokens = Math.min(8192, Math.max(2048, estimatedTokens * 2));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 130_000);

    let resp: Response;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelInfo.id,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const isTimeout = e instanceof DOMException && e.name === "AbortError";
      await auditLog(admin, jobId, "proofread_failed", "staff", null, {
        model: modelKey,
        reason: isTimeout ? "timeout_130s" : "fetch_error",
      });
      return jsonResponse({ success: false, error: isTimeout ? "Proofread timed out — try a faster model (haiku)" : "Proofread request failed" }, 504);
    }
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Proofread API failed:", resp.status, errText);
      await auditLog(admin, jobId, "proofread_failed", "staff", null, {
        model: modelKey,
        status: resp.status,
      });
      return jsonResponse({ success: false, error: "Proofread failed" }, 500);
    }

    const result = await resp.json();
    const rawText: string = result.content?.[0]?.text ?? "";
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    const cost = (inputTokens * modelInfo.inputPer1M + outputTokens * modelInfo.outputPer1M) / 1_000_000;

    // ── Parse response: SOURCE and (optional) TRANSLATION sections ─────────
    const sourceSection = sliceSection(rawText, "SOURCE", hasTranslation ? "TRANSLATION" : null);
    const translationSection = hasTranslation
      ? sliceSection(rawText, "TRANSLATION", null)
      : "";

    const sourceEdits = parseLLMResponse(sourceSection, { mode: "source", knownIds });
    const translationEdits = hasTranslation
      ? parseLLMResponse(translationSection, {
          mode: "translation",
          targetLang: targetLangCode!,
          knownIds,
        })
      : [];

    // Merge edits by id so we apply once
    const editsById = new Map<string, SegmentEdit>();
    for (const e of sourceEdits) editsById.set(e.id, { ...editsById.get(e.id), ...e, id: e.id });
    for (const e of translationEdits) {
      const existing = editsById.get(e.id) ?? { id: e.id };
      existing.translations = { ...(existing.translations ?? {}), ...(e.translations ?? {}) };
      editsById.set(e.id, existing);
    }
    const allEdits = Array.from(editsById.values());

    const { segments: newSegments, applied, source_edits, translation_edits } =
      applySegmentEdits(segments, allEdits);

    if (applied === 0) {
      await auditLog(admin, jobId, "proofread_no_changes", "staff", null, {
        model: modelKey,
        cost: cost.toFixed(6),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
      return jsonResponse({
        success: true,
        job_id: jobId,
        model: modelKey,
        applied: 0,
        message: "Claude returned no actionable changes",
      });
    }

    const newJson = buildTranscriptJsonV2(newSegments, {
      provider: "anthropic-proofread",
    });
    const newText = denormalizeText(newSegments);
    const newTranslation = targetLangCode ? denormalizeTranslation(newSegments, targetLangCode) : null;
    const wc = wordCount(newSegments);

    // ── Persist as a new transcription_versions row (is_active: false) ─────
    const { error: versionErr } = await admin
      .from("transcription_versions")
      .insert({
        job_id: jobId,
        version_type: "proofread",
        provider: "anthropic",
        model: modelKey,
        transcript_text: newText,
        transcript_json: newJson,
        transcript_format_version: TRANSCRIPT_FORMAT_VERSION,
        word_count: wc,
        cost,
        is_active: false,
        ...(fileIndex !== null ? { file_index: fileIndex } : {}),
      });

    if (versionErr) {
      console.error("Version insert failed:", versionErr);
      return jsonResponse({ success: false, error: "Failed to save version" }, 500);
    }

    // Accumulate cost
    const newTotalCost = (job.ai_total_cost as number ?? 0) + cost;
    await admin
      .from("transcription_jobs")
      .update({ ai_total_cost: newTotalCost })
      .eq("id", jobId);

    await auditLog(admin, jobId, "proofread_completed", "staff", null, {
      model: modelKey,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost: cost.toFixed(6),
      applied,
      source_edits,
      translation_edits,
      target_language: targetLangCode,
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      model: modelKey,
      applied,
      source_edits,
      translation_edits,
      target_language: targetLangCode,
      cost: Number(cost.toFixed(6)),
      ai_total_cost: Number(newTotalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-proofread error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildPromptSourceOnly(
  serialized: string,
  langContext: string,
  contextBlock: string,
  scriptInstruction: string,
): string {
  return `You are a professional transcription proofreader.

${langContext}

${contextBlock ? `=== CONTEXT FROM OTHER FILES (for consistent names/terms) ===\n${contextBlock}\n\n` : ""}=== TRANSCRIPT SEGMENTS ===
Each segment is prefixed with [id] (Speaker @ timestamp). Rewrite ONLY the text on the same line.

${serialized}

Rules:
- Output EXACTLY the same number of segments, each starting with the EXACT same [id] (the 8-character prefix).
- Fix spelling, misrecognitions, and obvious errors in the source text.
- Do NOT change meaning, tone, or content.
- Do NOT translate.
- Do NOT add commentary, notes, or extra segments.
- ${scriptInstruction || "Preserve the original script."}

Output format:
---SOURCE---
[id1] corrected text for that segment
[id2] corrected text for that segment
...`;
}

function buildPromptWithTranslation(
  serialized: string,
  langContext: string,
  contextBlock: string,
  scriptInstruction: string,
  targetLangName: string,
  targetLangCode: string,
): string {
  return `You are a professional transcription proofreader. You will proofread BOTH the source text AND its ${targetLangName} translation, per-segment.

${langContext}
Target translation language: ${targetLangName} [${targetLangCode}]

${contextBlock ? `=== CONTEXT FROM OTHER FILES (for consistent names/terms) ===\n${contextBlock}\n\n` : ""}=== TRANSCRIPT SEGMENTS ===
Each segment is prefixed with [id] (Speaker @ timestamp). The "→ ${targetLangCode}:" line below it shows the current translation.

${serialized}

Rules for source text:
- ${scriptInstruction || "Preserve the original script."}
- Fix spelling, misrecognitions, and obvious errors. Do NOT change meaning, tone, or content.

Rules for translation:
- Each translated segment must accurately render ONLY that segment's source.
- If the current translation has content misaligned, fix it.
- Fix grammar, punctuation, and ensure proper nouns match the corrected source.
- Output each segment's translation on its own line.

Output format — exactly two sections, exact markers:
---SOURCE---
[id1] corrected source for segment 1
[id2] corrected source for segment 2
...
---TRANSLATION---
[id1] ${targetLangName} translation for segment 1
[id2] ${targetLangName} translation for segment 2
...`;
}

// ── Section slicer ───────────────────────────────────────────────────────────

function sliceSection(text: string, name: string, nextName: string | null): string {
  const startRe = new RegExp(`---${name}---`, "i");
  const startMatch = text.match(startRe);
  if (!startMatch || startMatch.index === undefined) {
    // If no marker, treat the whole response as the source section
    return name === "SOURCE" ? text : "";
  }
  const startIdx = startMatch.index + startMatch[0].length;
  if (!nextName) return text.slice(startIdx).trim();
  const endRe = new RegExp(`---${nextName}---`, "i");
  const endMatch = text.slice(startIdx).match(endRe);
  if (!endMatch || endMatch.index === undefined) return text.slice(startIdx).trim();
  return text.slice(startIdx, startIdx + endMatch.index).trim();
}
