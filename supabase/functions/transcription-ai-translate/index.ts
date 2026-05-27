// POST /functions/v1/transcription-ai-translate
// Body: { job_id: string, file_index?: number }
//
// V2 implementation: translates per-segment. Chunks segments by character
// budget, asks Claude for an id-keyed translation block per chunk, parses back
// into SegmentEdit[] with translations[targetLangCode] populated. Mutates the
// active version's segments in place + updates job/source_file denormalized
// translated_text. No new version row — translations are additive metadata on
// existing segments, not a content milestone.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";
import {
  type Segment,
  readSegments,
  applySegmentEdits,
  buildTranscriptJsonV2,
  denormalizeText,
  denormalizeTranslation,
  serializeForLLM,
  parseLLMResponse,
  chunkSegments,
} from "../_shared/transcript-segments.ts";

const MAX_CHUNK_CHARS = 6000;
const TRANSLATE_TIMEOUT_MS = 130_000;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const jobId = body?.job_id as string;
    const fileIndex = typeof body?.file_index === "number" ? body.file_index : null;
    if (!jobId) return jsonResponse({ success: false, error: "job_id required" }, 400);

    const admin = getServiceClient();
    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_text, transcript_json, transcript_format_version, translation_target_language_id, detected_language, source_language_id, ai_total_cost, source_files, translated_text")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    if (jobErr || !job) return jsonResponse({ success: false, error: "Job not found" }, 404);

    if (!job.translation_target_language_id) {
      return jsonResponse({ success: false, error: "No target language set" }, 400);
    }

    type SourceFile = { transcript_text?: string; translated_text?: string; transcript_json?: unknown; name?: string };
    const files = (job.source_files as SourceFile[]) ?? [];

    // ── Resolve scope: per-file or whole job ───────────────────────────────
    let sourceJson: unknown;
    if (fileIndex !== null) {
      if (fileIndex < 0 || fileIndex >= files.length) {
        return jsonResponse({ success: false, error: `Invalid file_index: ${fileIndex}` }, 400);
      }
      sourceJson = files[fileIndex].transcript_json;
    } else {
      sourceJson = job.transcript_json;
    }

    // Refuse v1.
    const isV2 = sourceJson && typeof sourceJson === "object" &&
      (sourceJson as { format_version?: number }).format_version === 2;
    if (!isV2) {
      return jsonResponse({
        success: false,
        error: "Job is in legacy v1 format. Run transcription-backfill-segments before translating.",
        code: "BACKFILL_REQUIRED",
      }, 409);
    }
    const segments: Segment[] = await readSegments(sourceJson);
    if (segments.length === 0) {
      return jsonResponse({ success: false, error: "No segments to translate" }, 400);
    }

    // ── Resolve language names ─────────────────────────────────────────────
    const { data: targetLang } = await admin
      .from("languages")
      .select("name, code")
      .eq("id", job.translation_target_language_id)
      .maybeSingle();
    if (!targetLang) return jsonResponse({ success: false, error: "Target language not found" }, 400);
    const targetLangCode: string = targetLang.code;
    const targetLangName: string = targetLang.name;

    let sourceLangName = job.detected_language ?? "the source language";
    if (job.source_language_id) {
      const { data: srcLang } = await admin
        .from("languages")
        .select("name")
        .eq("id", job.source_language_id)
        .maybeSingle();
      if (srcLang?.name) sourceLangName = srcLang.name;
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 503);
    }

    // ── Chunk + translate ──────────────────────────────────────────────────
    const chunks = chunkSegments(segments, MAX_CHUNK_CHARS);
    const allEdits: Array<{ id: string; translations: Record<string, string> }> = [];
    let totalCost = 0;
    let totalIn = 0;
    let totalOut = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const knownIds = chunk.map((s) => s.id);
      const serialized = serializeForLLM(chunk, {});
      const prompt = buildPrompt(serialized, sourceLangName, targetLangName, targetLangCode);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
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
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timeout);
        const isTimeout = e instanceof DOMException && e.name === "AbortError";
        await auditLog(admin, jobId, "translation_failed", "system", null, {
          chunk_index: ci,
          reason: isTimeout ? "timeout" : "fetch_error",
        });
        return jsonResponse({ success: false, error: isTimeout ? "Translation timed out" : "Translation request failed" }, 504);
      }
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Translation API failed:", resp.status, errText);
        await auditLog(admin, jobId, "translation_failed", "system", null, {
          status: resp.status,
          chunk_index: ci,
        });
        return jsonResponse({ success: false, error: "Translation failed" }, 500);
      }

      const result = await resp.json();
      const rawText: string = result.content?.[0]?.text ?? "";
      const inTok = result.usage?.input_tokens ?? 0;
      const outTok = result.usage?.output_tokens ?? 0;
      totalIn += inTok;
      totalOut += outTok;
      totalCost += (inTok * 3 + outTok * 15) / 1_000_000;

      const edits = parseLLMResponse(rawText, {
        mode: "translation",
        targetLang: targetLangCode,
        knownIds,
      });
      for (const e of edits) {
        if (e.translations) {
          allEdits.push({ id: e.id, translations: e.translations });
        }
      }
    }

    if (allEdits.length === 0) {
      await auditLog(admin, jobId, "translation_completed", "system", null, {
        target_language: targetLangName,
        target_language_code: targetLangCode,
        chunks: chunks.length,
        applied: 0,
        message: "Claude returned no parsable translations",
        cost: totalCost.toFixed(6),
      });
      return jsonResponse({ success: false, error: "Translation parse produced no edits" }, 500);
    }

    const { segments: newSegments, applied, translation_edits } =
      applySegmentEdits(segments, allEdits);

    const newJson = buildTranscriptJsonV2(newSegments, {
      provider: "anthropic-translate",
      language_code: targetLangCode,
    });
    const newText = denormalizeText(newSegments);
    const newTranslation = denormalizeTranslation(newSegments, targetLangCode);

    // ── Persist: mutate active version's transcript_json + job/source_file ─
    if (fileIndex !== null) {
      const updatedFiles = [...files];
      updatedFiles[fileIndex] = {
        ...updatedFiles[fileIndex],
        transcript_json: newJson,
        transcript_text: newText,
        translated_text: newTranslation,
      };
      await admin
        .from("transcription_jobs")
        .update({ source_files: updatedFiles })
        .eq("id", jobId);

      // Update active per-file version (if one exists)
      await admin
        .from("transcription_versions")
        .update({ transcript_json: newJson, transcript_text: newText })
        .eq("job_id", jobId)
        .eq("file_index", fileIndex)
        .eq("is_active", true);
    } else {
      await admin
        .from("transcription_jobs")
        .update({
          transcript_json: newJson,
          transcript_text: newText,
          translated_text: newTranslation,
        })
        .eq("id", jobId);

      await admin
        .from("transcription_versions")
        .update({ transcript_json: newJson, transcript_text: newText })
        .eq("job_id", jobId)
        .is("file_index", null)
        .eq("is_active", true);
    }

    const newTotalCost = ((job.ai_total_cost as number) ?? 0) + totalCost;
    await admin
      .from("transcription_jobs")
      .update({ ai_total_cost: newTotalCost })
      .eq("id", jobId);

    await auditLog(admin, jobId, "translation_completed", "system", null, {
      target_language: targetLangName,
      target_language_code: targetLangCode,
      chunks: chunks.length,
      applied,
      translation_edits,
      input_tokens: totalIn,
      output_tokens: totalOut,
      cost: totalCost.toFixed(6),
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      target_language: targetLangName,
      target_language_code: targetLangCode,
      applied,
      translation_edits,
      cost: Number(totalCost.toFixed(6)),
      ai_total_cost: Number(newTotalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-translate error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});

function buildPrompt(
  serialized: string,
  sourceLangName: string,
  targetLangName: string,
  targetLangCode: string,
): string {
  return `You are a professional translator. Translate the following transcript segments from ${sourceLangName} to ${targetLangName}.

=== SEGMENTS ===
Each segment is prefixed with [id] (Speaker @ timestamp).

${serialized}

Rules:
- Output EXACTLY one line per segment, starting with the same [id] prefix.
- Translate ONLY the text that follows the (Speaker @ time) header.
- Do NOT include the speaker label or timestamp in your output.
- Maintain the tone and register of the original speech.
- For proper nouns (names, places, brands), keep the original spelling unless there is a standard ${targetLangName} form.
- Do NOT add explanations, notes, or extra lines.

Output format:
[id1] ${targetLangName} translation for segment 1
[id2] ${targetLangName} translation for segment 2
...
`;
}
