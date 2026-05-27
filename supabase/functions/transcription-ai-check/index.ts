// POST /functions/v1/transcription-ai-check
// Body: { job_id: string }
// Claude Haiku reviews the transcript and assigns a quality score (A/B/C/D).
// Cost: ~$0.001 per check.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  jsonResponse,
  preflight,
  getServiceClient,
  auditLog,
} from "../_shared/transcription.ts";

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
      .select("id, transcript_text, detected_language, word_count, file_duration_seconds")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    if (!job.transcript_text || job.transcript_text.trim().length === 0) {
      await admin
        .from("transcription_jobs")
        .update({ ai_quality_score: "D", ai_quality_notes: "Empty or no transcript text." })
        .eq("id", jobId);
      return jsonResponse({ success: true, score: "D", reason: "empty transcript" });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("ANTHROPIC_API_KEY not configured, skipping quality check");
      return jsonResponse({ success: true, skipped: true });
    }

    // Truncate long transcripts to save tokens — first 3000 chars + last 1000
    let textSample = job.transcript_text;
    if (textSample.length > 4500) {
      textSample = textSample.slice(0, 3000) + "\n\n[...middle truncated...]\n\n" + textSample.slice(-1000);
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are a transcription quality auditor. Review this AI-generated transcript and score it.

Detected language: ${job.detected_language ?? "unknown"}
Word count: ${job.word_count ?? "unknown"}
Audio duration: ${job.file_duration_seconds ?? "unknown"} seconds

Transcript:
---
${textSample}
---

Evaluate on these criteria:
1. Coherence: Does the text read as natural spoken language?
2. Completeness: Any obvious gaps, repeated sections, or cut-offs?
3. Proper nouns: Any likely misrecognitions (garbled names, places)?
4. Language match: Does the content match the detected language?

Respond in exactly this JSON format (no markdown, no extra text):
{"score":"A","notes":"Brief explanation"}

Scoring:
A = High quality, reads naturally, no obvious errors
B = Good quality, minor issues (1-2 likely misrecognitions)
C = Acceptable, several issues but usable
D = Poor quality, significant errors or incoherence`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("Claude quality check failed:", resp.status);
      return jsonResponse({ success: false, error: "Quality check API failed" }, 500);
    }

    const result = await resp.json();
    const rawText = result.content?.[0]?.text ?? "";
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;
    // Haiku pricing: $0.25/1M input, $1.25/1M output
    const cost = (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;

    let score = "B";
    let notes = rawText;

    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      const parsed = JSON.parse(cleaned);
      if (parsed.score && ["A", "B", "C", "D"].includes(parsed.score)) {
        score = parsed.score;
        notes = parsed.notes ?? "";
      }
    } catch {
      score = "B";
      notes = `(non-JSON response) ${rawText.slice(0, 500)}`;
    }

    // Accumulate cost
    const { data: costRow } = await admin
      .from("transcription_jobs")
      .select("ai_total_cost")
      .eq("id", jobId)
      .maybeSingle();
    const newTotalCost = ((costRow?.ai_total_cost as number) ?? 0) + cost;

    await admin
      .from("transcription_jobs")
      .update({ ai_quality_score: score, ai_quality_notes: notes, ai_total_cost: newTotalCost })
      .eq("id", jobId);

    await auditLog(admin, jobId, "quality_checked", "system", null, { score, notes, cost: cost.toFixed(6) });

    return jsonResponse({ success: true, score, notes, cost: Number(cost.toFixed(6)) });
  } catch (e) {
    console.error("transcription-ai-check error:", e);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
