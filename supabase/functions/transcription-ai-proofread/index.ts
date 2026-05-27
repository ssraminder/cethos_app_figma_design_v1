// POST /functions/v1/transcription-ai-proofread
// Body: { job_id: string, model?: "haiku" | "sonnet" | "opus", file_index?: number, context?: string }
// Admin-invoked: Claude proofreads transcript + translation with cross-file context.
// Reads all files first to build a glossary of names/terms, then proofreads with that memory.
// Saves proofread transcript as a new version; updates translated_text in source_files JSONB.
// file_index: null/omitted = whole-job combined, 0-based = specific source file.
// context: optional pre-built context string (names, terms from other files in a batch).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";

const CLAUDE_MODELS: Record<string, { id: string; inputPer1M: number; outputPer1M: number }> = {
  haiku:  { id: "claude-haiku-4-5-20251001", inputPer1M: 0.25, outputPer1M: 1.25 },
  sonnet: { id: "claude-sonnet-4-6",         inputPer1M: 3,    outputPer1M: 15 },
  opus:   { id: "claude-opus-4-6",           inputPer1M: 15,   outputPer1M: 75 },
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

    if (!jobId) {
      return jsonResponse({ success: false, error: "job_id required" }, 400);
    }

    const modelInfo = CLAUDE_MODELS[modelKey];
    if (!modelInfo) {
      return jsonResponse({ success: false, error: `Invalid model: ${modelKey}. Use haiku, sonnet, or opus.` }, 400);
    }

    const admin = getServiceClient();

    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_text, translated_text, detected_language, source_language_id, ai_total_cost, source_files")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    type Word = { text: string; speaker_id?: string; start?: number; end?: number; type?: string };
    type TranscriptJson = { words?: Word[] };
    type SourceFile = { name?: string; transcript_text?: string; translated_text?: string; transcript_json?: TranscriptJson };
    const files = (job.source_files as SourceFile[]) ?? [];

    // Build numbered speaker segments from transcript_json for structured proofing
    type SpeakerSegment = { speaker: string; text: string; start: number; end: number };
    function buildSpeakerSegments(json: TranscriptJson | undefined): SpeakerSegment[] | null {
      if (!json?.words?.length) return null;
      const segments: SpeakerSegment[] = [];
      let currentSpeaker = "";
      let currentText = "";
      let segStart = 0;
      let segEnd = 0;
      for (const w of json.words) {
        if (w.type === "spacing") continue;
        const spk = w.speaker_id ?? "unknown";
        if (spk !== currentSpeaker && currentText.trim()) {
          segments.push({ speaker: currentSpeaker, text: currentText.trim(), start: segStart, end: segEnd });
          currentText = "";
        }
        if (spk !== currentSpeaker) {
          segStart = w.start ?? 0;
        }
        currentSpeaker = spk;
        currentText += w.text;
        segEnd = w.end ?? w.start ?? 0;
      }
      if (currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim(), start: segStart, end: segEnd });
      }
      return segments.length > 0 ? segments : null;
    }

    // Reconstruct transcript_json from proofread segments, preserving speaker IDs and timestamps
    function reconstructTranscriptJson(
      originalSegments: SpeakerSegment[],
      proofreadSegmentTexts: string[],
    ): TranscriptJson {
      const newWords: Word[] = [];
      const count = Math.min(proofreadSegmentTexts.length, originalSegments.length);
      for (let i = 0; i < count; i++) {
        if (i > 0) newWords.push({ text: " ", type: "spacing" });
        newWords.push({
          text: proofreadSegmentTexts[i],
          speaker_id: originalSegments[i].speaker,
          start: originalSegments[i].start,
          end: originalSegments[i].end,
          type: "text",
        });
      }
      return { words: newWords };
    }

    // Resolve transcript + translation text for the target file
    let transcriptText: string;
    let translatedText: string;
    let speakerSegments: SpeakerSegment[] | null = null;
    if (fileIndex !== null) {
      if (fileIndex < 0 || fileIndex >= files.length) {
        return jsonResponse({ success: false, error: `Invalid file_index: ${fileIndex}` }, 400);
      }
      transcriptText = files[fileIndex].transcript_text ?? "";
      translatedText = files[fileIndex].translated_text ?? "";
      speakerSegments = buildSpeakerSegments(files[fileIndex].transcript_json);
    } else {
      transcriptText = job.transcript_text ?? "";
      translatedText = (job as Record<string, unknown>).translated_text as string ?? "";
    }

    if (!transcriptText.trim()) {
      return jsonResponse({ success: false, error: "No transcript to proofread" }, 400);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 503);
    }

    // Resolve source language — map ISO 639-3 codes to names + scripts
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
    let langContext = "";
    let scriptInstruction = "";
    if (job.source_language_id) {
      const { data: lang } = await admin
        .from("languages")
        .select("name, native_name, code")
        .eq("id", job.source_language_id)
        .maybeSingle();
      if (lang) {
        langContext = `Language: ${lang.name}${lang.native_name ? ` (${lang.native_name})` : ""} [${lang.code}]`;
        const meta = LANG_META[lang.code];
        if (meta?.script) {
          scriptInstruction = `SCRIPT: This transcript MUST be in ${meta.script} script. If the transcription provider used the wrong script (e.g., Devanagari instead of Gurmukhi for Punjabi), transliterate the text to the correct ${meta.script} script.`;
        }
      }
    }
    if (!langContext && job.detected_language) {
      const meta = LANG_META[job.detected_language.toLowerCase()];
      if (meta) {
        langContext = `Language: ${meta.name}`;
        if (meta.script) {
          scriptInstruction = `SCRIPT: This transcript MUST be in ${meta.script} script. If the transcription provider used the wrong script (e.g., Devanagari instead of Gurmukhi for Punjabi), transliterate the text to the correct ${meta.script} script.`;
        }
      } else {
        langContext = `Detected language: ${job.detected_language}`;
      }
    }

    // Build cross-file context: names, terms, speakers from all files
    let contextBlock = "";
    if (externalContext) {
      contextBlock = externalContext;
    } else if (files.length > 1) {
      // Auto-build context from all files (truncated excerpts for names/terms)
      const excerpts = files.map((f, i) => {
        const text = f.transcript_text ?? "";
        // First 500 chars of each file for name/term extraction
        const excerpt = text.length > 500 ? text.slice(0, 500) + "..." : text;
        return `File ${i + 1} (${f.name ?? "unknown"}): ${excerpt}`;
      });
      contextBlock = excerpts.join("\n\n");
    }

    const hasTranslation = !!translatedText.trim();

    // Build the prompt: proofread transcript, and translation if available
    const useNumberedSegments = hasTranslation && speakerSegments && speakerSegments.length > 0;
    let prompt: string;
    if (useNumberedSegments) {
      // Numbered segment approach: gives Claude explicit structure to match
      const numberedTranscript = speakerSegments!.map((s, i) => `[${i + 1}] ${s.speaker}: ${s.text}`).join("\n");
      prompt = `You are a professional transcription proofreader. Proofread BOTH the transcript segments AND provide a matching English translation for each segment.

${langContext}

${contextBlock ? `=== CONTEXT FROM OTHER FILES (use for consistent names, terms, spelling) ===\n${contextBlock}\n\n` : ""}=== TRANSCRIPT SEGMENTS (${speakerSegments!.length} segments, numbered) ===
${numberedTranscript}

=== CURRENT ENGLISH TRANSLATION (for reference — may have alignment errors) ===
${translatedText}

Rules for transcript:
- Fix spelling errors, especially in the transcript's native script
- Fix obvious misrecognitions (garbled proper nouns, words that don't make sense in context)
- Use consistent spelling for names and terms across all files (refer to context above)
- Remove or clean up repeated filler words (um, uh, etc.) only if excessive
- Do NOT change the meaning, tone, or content
- Do NOT translate — keep each segment in its original language
${scriptInstruction ? `- ${scriptInstruction}` : "- LANGUAGE CHECK: if the transcript is in a different language than expected above (e.g., Hindi instead of Punjabi), note it as [Language: actual_language] on the first line before segment [1]"}

Rules for translation:
- Each segment's translation MUST accurately correspond to ONLY that segment's source text
- If the current translation has content misplaced under the wrong segment, fix it
- Fix grammar, spelling, and punctuation errors
- Ensure names and proper nouns match the corrected transcript

Output EXACTLY ${speakerSegments!.length} numbered lines for EACH section. Use these exact markers:
---TRANSCRIPT---
[1] corrected text for segment 1
[2] corrected text for segment 2
...
---TRANSLATION---
[1] English translation for segment 1
[2] English translation for segment 2
...`
    } else if (hasTranslation) {
      prompt = `You are a professional transcription proofreader. You will proofread BOTH the original transcript AND its English translation.

${langContext}

${contextBlock ? `=== CONTEXT FROM OTHER FILES (use for consistent names, terms, spelling) ===\n${contextBlock}\n\n` : ""}=== ORIGINAL TRANSCRIPT (proofread this) ===
${transcriptText}

=== ENGLISH TRANSLATION (proofread this) ===
${translatedText}

Rules for transcript:
- Fix spelling errors, especially in the transcript's native script
- Fix obvious misrecognitions (garbled proper nouns, words that don't make sense in context)
- Use consistent spelling for names and terms across all files (refer to context above)
- Keep speaker labels exactly as they are (e.g., "Speaker 1:", "Speaker A")
- Keep timestamps exactly as they are
- Remove or clean up repeated filler words (um, uh, etc.) only if excessive
- Do NOT change the meaning, tone, or content
- Do NOT translate — keep the transcript in its original language
${scriptInstruction ? `- ${scriptInstruction}` : "- LANGUAGE CHECK: verify the transcript is actually in the expected language above. If it is in a different language (e.g., Hindi instead of Punjabi), note the actual language at the very top of the corrected transcript as a single comment line: [Language: Hindi] — then proofread in the actual language, not the expected one"}

Rules for translation:
- Fix grammar, spelling, and punctuation errors
- Ensure names and proper nouns match the corrected transcript spelling
- Fix awkward or unclear phrasing while preserving the original meaning
- Keep speaker labels and timestamps exactly as they are
- Do NOT re-translate from scratch — correct the existing translation

Output format (use these exact markers):
---TRANSCRIPT---
[corrected transcript here]
---TRANSLATION---
[corrected translation here]`;
    } else {
      prompt = `You are a professional transcription proofreader. Fix the following AI-generated transcript.

${langContext}

${contextBlock ? `=== CONTEXT FROM OTHER FILES (use for consistent names, terms, spelling) ===\n${contextBlock}\n\n` : ""}Rules:
- Fix spelling errors, especially for words in the transcript's native script
- Fix obvious misrecognitions (garbled proper nouns, words that don't make sense in context)
- Use consistent spelling for names and terms across all files (refer to context above)
- Keep speaker labels exactly as they are (e.g., "Speaker 1:", "Speaker A")
- Keep timestamps exactly as they are
- Remove or clean up repeated filler words (um, uh, etc.) only if excessive
- Do NOT change the meaning, tone, or content of what was said
- Do NOT add explanations, notes, or commentary
- Do NOT translate — keep the transcript in its original language
${scriptInstruction ? `- ${scriptInstruction}` : ""}
- Output ONLY the corrected transcript text, nothing else

Transcript:
${transcriptText}`;
    }

    // Scale max_tokens to input: output ≈ input size + translation. Cap at 8192.
    const estimatedTokens = Math.ceil((transcriptText.length + translatedText.length) / 3);
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
      console.error("Proofread API", isTimeout ? "timed out at 130s" : "fetch error:", e);
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
    const rawText = result.content?.[0]?.text ?? "";
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    const cost = (inputTokens * modelInfo.inputPer1M + outputTokens * modelInfo.outputPer1M) / 1_000_000;

    // Parse response: split transcript and translation if both were proofread
    let proofreadText: string;
    let proofreadTranslation: string | null = null;
    let proofreadJson: TranscriptJson | null = null;

    // Helper: parse numbered lines "[1] text" → array of individual segment strings
    function parseNumberedSegments(section: string): string[] {
      const lines = section.split("\n").filter(l => l.trim());
      return lines.map(l => l.replace(/^\[\d+\]\s*/, "").trim()).filter(Boolean);
    }

    if (rawText.includes("---TRANSCRIPT---")) {
      const transcriptMatch = rawText.match(/---TRANSCRIPT---\s*([\s\S]*?)(?:---TRANSLATION---|$)/);
      const translationMatch = rawText.match(/---TRANSLATION---\s*([\s\S]*?)$/);
      const rawTranscript = transcriptMatch?.[1]?.trim() ?? rawText;
      const rawTranslation = translationMatch?.[1]?.trim() ?? null;

      if (useNumberedSegments && rawTranscript.includes("[1]")) {
        const transcriptParts = parseNumberedSegments(rawTranscript);
        const translationParts = rawTranslation ? parseNumberedSegments(rawTranslation) : null;
        proofreadText = transcriptParts.join("\n\n");
        proofreadTranslation = translationParts ? translationParts.join("\n\n") : null;
        // Reconstruct transcript_json preserving speaker IDs and timestamps
        if (speakerSegments) {
          proofreadJson = reconstructTranscriptJson(speakerSegments, transcriptParts);
        }
      } else {
        proofreadText = rawTranscript;
        proofreadTranslation = rawTranslation;
      }
    } else {
      proofreadText = rawText;
    }

    const wordCount = proofreadText.split(/\s+/).filter(Boolean).length;

    // Backfill the original version's transcript_json so reverting restores the speaker view
    if (proofreadJson && fileIndex !== null) {
      const originalJson = files[fileIndex]?.transcript_json;
      if (originalJson) {
        await admin
          .from("transcription_versions")
          .update({ transcript_json: originalJson })
          .eq("job_id", jobId)
          .eq("file_index", fileIndex)
          .eq("version_type", "original")
          .is("transcript_json", null);
      }
    }

    // Save proofread transcript as a new version
    const { error: versionErr } = await admin
      .from("transcription_versions")
      .insert({
        job_id: jobId,
        version_type: "proofread",
        provider: "anthropic",
        model: modelKey,
        transcript_text: proofreadText,
        word_count: wordCount,
        cost,
        is_active: false,
        ...(proofreadJson ? { transcript_json: proofreadJson } : {}),
        ...(fileIndex !== null ? { file_index: fileIndex } : {}),
      });

    if (versionErr) {
      console.error("Version insert failed:", versionErr);
      return jsonResponse({ success: false, error: "Failed to save version" }, 500);
    }

    // If translation was proofread, update it in source_files JSONB
    if (proofreadTranslation && fileIndex !== null) {
      const updatedFiles = [...files];
      updatedFiles[fileIndex] = { ...updatedFiles[fileIndex], translated_text: proofreadTranslation };
      await admin
        .from("transcription_jobs")
        .update({ source_files: updatedFiles })
        .eq("id", jobId);
    } else if (proofreadTranslation && fileIndex === null) {
      await admin
        .from("transcription_jobs")
        .update({ translated_text: proofreadTranslation })
        .eq("id", jobId);
    }

    // Accumulate cost
    const newTotalCost = (job.ai_total_cost ?? 0) + cost;
    await admin
      .from("transcription_jobs")
      .update({ ai_total_cost: newTotalCost })
      .eq("id", jobId);

    await auditLog(admin, jobId, "proofread_completed", "staff", null, {
      model: modelKey,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost: cost.toFixed(6),
      word_count: wordCount,
      translation_proofread: !!proofreadTranslation,
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      model: modelKey,
      word_count: wordCount,
      translation_proofread: !!proofreadTranslation,
      cost: Number(cost.toFixed(6)),
      ai_total_cost: Number(newTotalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-proofread error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
