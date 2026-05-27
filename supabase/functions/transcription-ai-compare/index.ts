// POST /functions/v1/transcription-ai-compare
// Body: { job_id: string, version_a: string, version_b: string, model?: "haiku" | "sonnet" | "opus" }
// Admin-invoked: Claude compares two transcript versions and provides
// a structured diff with quality assessment and recommendation.

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
    const versionA = body?.version_a as string; // "current" or a version UUID
    const versionB = body?.version_b as string; // a version UUID
    const modelKey = (body?.model as string) ?? "sonnet";

    if (!jobId) {
      return jsonResponse({ success: false, error: "job_id required" }, 400);
    }
    if (!versionA || !versionB) {
      return jsonResponse({ success: false, error: "version_a and version_b required" }, 400);
    }

    const modelInfo = CLAUDE_MODELS[modelKey];
    if (!modelInfo) {
      return jsonResponse({ success: false, error: `Invalid model: ${modelKey}` }, 400);
    }

    const admin = getServiceClient();

    const { data: job, error: jobErr } = await admin
      .from("transcription_jobs")
      .select("id, transcript_text, detected_language, ai_total_cost")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    // Resolve text for version A
    let textA = "";
    let labelA = "";
    if (versionA === "current") {
      textA = job.transcript_text ?? "";
      labelA = "Current (active)";
    } else {
      const { data: va } = await admin
        .from("transcription_versions")
        .select("transcript_text, version_type, provider, model")
        .eq("id", versionA)
        .eq("job_id", jobId)
        .maybeSingle();
      if (!va?.transcript_text) {
        return jsonResponse({ success: false, error: "Version A not found" }, 404);
      }
      textA = va.transcript_text;
      labelA = `${va.version_type} (${va.provider}/${va.model})`;
    }

    // Resolve text for version B
    let textB = "";
    let labelB = "";
    if (versionB === "current") {
      textB = job.transcript_text ?? "";
      labelB = "Current (active)";
    } else {
      const { data: vb } = await admin
        .from("transcription_versions")
        .select("transcript_text, version_type, provider, model")
        .eq("id", versionB)
        .eq("job_id", jobId)
        .maybeSingle();
      if (!vb?.transcript_text) {
        return jsonResponse({ success: false, error: "Version B not found" }, 404);
      }
      textB = vb.transcript_text;
      labelB = `${vb.version_type} (${vb.provider}/${vb.model})`;
    }

    if (!textA.trim() || !textB.trim()) {
      return jsonResponse({ success: false, error: "Both versions must have text" }, 400);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 503);
    }

    // Truncate very long transcripts for comparison (keep first 4000 + last 1000 chars each)
    const truncate = (t: string) =>
      t.length > 5500
        ? t.slice(0, 4000) + "\n\n[...middle truncated...]\n\n" + t.slice(-1000)
        : t;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelInfo.id,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `You are a transcription quality reviewer. Compare these two transcript versions of the same audio and provide a structured analysis.

Detected language: ${job.detected_language ?? "unknown"}

=== VERSION A: ${labelA} ===
${truncate(textA)}

=== VERSION B: ${labelB} ===
${truncate(textB)}

Respond in exactly this JSON format (no markdown, no extra text):
{
  "summary": "1-2 sentence overall comparison",
  "differences": [
    {"location": "near start/middle/end", "version_a": "text in A", "version_b": "text in B", "assessment": "which is more likely correct and why"}
  ],
  "quality_a": {"score": "A/B/C/D", "strengths": "...", "weaknesses": "..."},
  "quality_b": {"score": "A/B/C/D", "strengths": "...", "weaknesses": "..."},
  "recommendation": "a" or "b",
  "recommendation_reason": "why this version is better"
}

List the 5-10 most significant differences. Focus on meaning-changing differences, not trivial formatting.`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Compare API failed:", resp.status, errText);
      return jsonResponse({ success: false, error: "Comparison failed" }, 500);
    }

    const result = await resp.json();
    const rawText = result.content?.[0]?.text ?? "";
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    const cost = (inputTokens * modelInfo.inputPer1M + outputTokens * modelInfo.outputPer1M) / 1_000_000;

    let comparison: Record<string, unknown>;
    try {
      // Strip markdown code fences if Claude wrapped the JSON
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      comparison = JSON.parse(cleaned);
    } catch {
      comparison = { raw_response: rawText.slice(0, 2000) };
    }

    // Accumulate cost
    const newTotalCost = (job.ai_total_cost ?? 0) + cost;
    await admin
      .from("transcription_jobs")
      .update({ ai_total_cost: newTotalCost })
      .eq("id", jobId);

    await auditLog(admin, jobId, "ai_comparison_completed", "staff", null, {
      model: modelKey,
      version_a: versionA,
      version_b: versionB,
      cost: cost.toFixed(6),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      model: modelKey,
      comparison,
      cost: Number(cost.toFixed(6)),
      ai_total_cost: Number(newTotalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-compare error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
