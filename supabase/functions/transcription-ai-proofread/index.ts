// POST /functions/v1/transcription-ai-proofread
// Body: { job_id: string, model?: "haiku" | "sonnet" | "opus" }
// Admin-invoked: Claude proofreads the transcript, fixes spelling errors,
// normalizes speaker labels, removes filler. Saves as a new version.

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
      .select("id, transcript_text, detected_language, source_language_id, ai_total_cost")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    if (!job.transcript_text?.trim()) {
      return jsonResponse({ success: false, error: "No transcript to proofread" }, 400);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 503);
    }

    // Resolve source language for script-aware proofreading
    let langContext = "";
    if (job.source_language_id) {
      const { data: lang } = await admin
        .from("languages")
        .select("name, native_name, code")
        .eq("id", job.source_language_id)
        .maybeSingle();
      if (lang) {
        langContext = `Language: ${lang.name}${lang.native_name ? ` (${lang.native_name})` : ""} [${lang.code}]`;
      }
    }
    if (!langContext && job.detected_language) {
      langContext = `Detected language: ${job.detected_language}`;
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelInfo.id,
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `You are a professional transcription proofreader. Fix the following AI-generated transcript.

${langContext}

Rules:
- Fix spelling errors, especially for words in the transcript's native script
- Fix obvious misrecognitions (garbled proper nouns, words that don't make sense in context)
- Keep speaker labels exactly as they are (e.g., "Speaker 1:", "Speaker A")
- Keep timestamps exactly as they are
- Remove or clean up repeated filler words (um, uh, etc.) only if excessive
- Do NOT change the meaning, tone, or content of what was said
- Do NOT add explanations, notes, or commentary
- Do NOT translate — keep the transcript in its original language
- Output ONLY the corrected transcript text, nothing else

Transcript:
${job.transcript_text}`,
          },
        ],
      }),
    });

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
    const proofreadText = result.content?.[0]?.text ?? "";
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    const cost = (inputTokens * modelInfo.inputPer1M + outputTokens * modelInfo.outputPer1M) / 1_000_000;
    const wordCount = proofreadText.split(/\s+/).filter(Boolean).length;

    // Save as a new version
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
      });

    if (versionErr) {
      console.error("Version insert failed:", versionErr);
      return jsonResponse({ success: false, error: "Failed to save version" }, 500);
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
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      model: modelKey,
      word_count: wordCount,
      cost: Number(cost.toFixed(6)),
      ai_total_cost: Number(newTotalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-proofread error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
