// POST /functions/v1/transcription-ai-compare
// Body: { job_id: string, version_a: string, version_b: string, model?: "haiku" | "sonnet" | "opus", file_index?: number }
// Admin-invoked: Claude compares two transcript versions and provides
// a structured diff with quality assessment and recommendation.
// file_index: null/omitted = whole-job combined, 0-based = specific source file.

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
  diffSegmentCounts,
} from "../_shared/transcript-segments.ts";

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
    const fileIndex = typeof body?.file_index === "number" ? body.file_index : null;

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
      .select("id, transcript_text, transcript_json, detected_language, ai_total_cost, source_files")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    // Resolve the "current" transcript (text + json, per-file or combined)
    const currentText = (() => {
      if (fileIndex !== null) {
        const files = job.source_files as Array<{ transcript_text?: string }> | null;
        return files?.[fileIndex]?.transcript_text ?? "";
      }
      return job.transcript_text ?? "";
    })();
    const currentJson = (() => {
      if (fileIndex !== null) {
        const files = job.source_files as Array<{ transcript_json?: unknown }> | null;
        return files?.[fileIndex]?.transcript_json ?? null;
      }
      return job.transcript_json ?? null;
    })();

    async function fetchVersion(id: string) {
      const { data: v } = await admin
        .from("transcription_versions")
        .select("transcript_text, transcript_json, version_type, provider, model")
        .eq("id", id)
        .eq("job_id", jobId)
        .maybeSingle();
      return v;
    }

    let textA = "";
    let labelA = "";
    let jsonA: unknown = null;
    if (versionA === "current") {
      textA = currentText;
      labelA = "Current (active)";
      jsonA = currentJson;
    } else {
      const va = await fetchVersion(versionA);
      if (!va?.transcript_text) return jsonResponse({ success: false, error: "Version A not found" }, 404);
      textA = va.transcript_text;
      labelA = `${va.version_type} (${va.provider}/${va.model})`;
      jsonA = va.transcript_json;
    }

    let textB = "";
    let labelB = "";
    let jsonB: unknown = null;
    if (versionB === "current") {
      textB = currentText;
      labelB = "Current (active)";
      jsonB = currentJson;
    } else {
      const vb = await fetchVersion(versionB);
      if (!vb?.transcript_text) return jsonResponse({ success: false, error: "Version B not found" }, 404);
      textB = vb.transcript_text;
      labelB = `${vb.version_type} (${vb.provider}/${vb.model})`;
      jsonB = vb.transcript_json;
    }

    // ── Deterministic per-segment diff when both sides are v2 ──────────────
    let segmentDiff: ReturnType<typeof diffSegmentCounts> | null = null;
    let perSegmentChanges: Array<{ id: string; source_a: string; source_b: string }> = [];
    const isV2A = jsonA && typeof jsonA === "object" &&
      (jsonA as { format_version?: number }).format_version === 2;
    const isV2B = jsonB && typeof jsonB === "object" &&
      (jsonB as { format_version?: number }).format_version === 2;
    if (isV2A && isV2B) {
      const segsA: Segment[] = await readSegments(jsonA);
      const segsB: Segment[] = await readSegments(jsonB);
      segmentDiff = diffSegmentCounts(segsA, segsB);
      const aById = new Map(segsA.map((s) => [s.id, s] as const));
      for (const sb of segsB) {
        const sa = aById.get(sb.id);
        if (sa && sa.text !== sb.text) {
          perSegmentChanges.push({ id: sb.id, source_a: sa.text, source_b: sb.text });
          if (perSegmentChanges.length >= 20) break; // cap response size
        }
      }
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
      ...(fileIndex !== null ? { file_index: fileIndex } : {}),
    });

    return jsonResponse({
      success: true,
      job_id: jobId,
      model: modelKey,
      comparison,
      segment_diff: segmentDiff,
      changed_segments: perSegmentChanges,
      cost: Number(cost.toFixed(6)),
      ai_total_cost: Number(newTotalCost.toFixed(6)),
    });
  } catch (e) {
    console.error("transcription-ai-compare error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
