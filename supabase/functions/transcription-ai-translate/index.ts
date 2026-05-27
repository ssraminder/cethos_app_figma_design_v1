// POST /functions/v1/transcription-ai-translate
// Body: { job_id: string }
// Claude translates the transcript text to the target language.
// Paragraph-level translation preserving speaker labels and structure.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";

const MAX_CHUNK_CHARS = 6000;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const jobId = body?.job_id as string;
    if (!jobId) {
      return jsonResponse({ success: false, error: "job_id required" }, 400);
    }

    const admin = getServiceClient();

    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_text, translation_target_language_id, detected_language, ai_total_cost")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    if (!job.transcript_text?.trim()) {
      return jsonResponse({ success: false, error: "No transcript to translate" }, 400);
    }

    if (!job.translation_target_language_id) {
      return jsonResponse({ success: false, error: "No target language set" }, 400);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 503);
    }

    // Resolve target language name
    const { data: targetLang } = await admin
      .from("languages")
      .select("name, code")
      .eq("id", job.translation_target_language_id)
      .maybeSingle();

    if (!targetLang) {
      return jsonResponse({ success: false, error: "Target language not found" }, 400);
    }

    const sourceLangName = job.detected_language ?? "the source language";
    const targetLangName = targetLang.name;

    // Split long transcripts into chunks for reliable translation
    const chunks = splitIntoChunks(job.transcript_text, MAX_CHUNK_CHARS);
    const translatedChunks: string[] = [];
    let totalCost = 0;

    for (const chunk of chunks) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `Translate this transcript from ${sourceLangName} to ${targetLangName}.

Rules:
- Translate paragraph by paragraph, preserving the structure
- Keep speaker labels as-is (e.g., "Speaker 1:", "Speaker 2:")
- Keep timestamps in their original format if present
- Do not add explanations or notes — output only the translation
- Maintain the tone and register of the original speech
- For proper nouns (names, places, brands), keep the original spelling unless there is a standard ${targetLangName} form

Transcript:
${chunk}`,
            },
          ],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Translation API failed:", resp.status, errText);
        await auditLog(admin, jobId, "translation_failed", "system", null, {
          status: resp.status,
          chunk_index: translatedChunks.length,
        });
        return jsonResponse({ success: false, error: "Translation failed" }, 500);
      }

      const result = await resp.json();
      const translated = result.content?.[0]?.text ?? "";
      translatedChunks.push(translated);
      // Sonnet pricing: $3/1M input, $15/1M output
      const inTok = result.usage?.input_tokens ?? 0;
      const outTok = result.usage?.output_tokens ?? 0;
      totalCost += (inTok * 3 + outTok * 15) / 1_000_000;
    }

    const fullTranslation = translatedChunks.join("\n\n");

    // Accumulate cost
    const newTotalCost = ((job.ai_total_cost as number) ?? 0) + totalCost;

    const { error: updateErr } = await admin
      .from("transcription_jobs")
      .update({ translated_text: fullTranslation, ai_total_cost: newTotalCost })
      .eq("id", jobId);

    if (updateErr) {
      console.error("Translation update failed:", updateErr);
      return jsonResponse({ success: false, error: "Failed to store translation" }, 500);
    }

    await auditLog(admin, jobId, "translation_completed", "system", null, {
      target_language: targetLangName,
      chunks: chunks.length,
      translated_length: fullTranslation.length,
      cost: totalCost.toFixed(6),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      target_language: targetLangName,
      translated_length: fullTranslation.length,
      cost: Number(totalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-translate error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});

function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}
