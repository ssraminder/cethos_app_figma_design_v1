/**
 * cvp-triage-test-feedback
 *
 * Tier 1 of the feedback lifecycle. After an applicant submits per-error
 * accept/reject responses, this function runs Sonnet over each REJECT row
 * (and any unusual ACCEPT pattern) to judge the merit of the pushback.
 *
 * Reads the AI's original error claim, the applicant's English rejection
 * reason, and the source/target context. Writes back an English-language
 * verdict + confidence (0-100) + 1–2 sentence reasoning. Staff can then
 * either trust the verdict (if confidence is high) or escalate to HITL
 * paid review for the language pair (Tier 2, separate function).
 *
 * Verdict semantics:
 *   - clear              → applicant supplied a clear reason; subsequent
 *                          verdict columns describe the merit. (Implicit
 *                          for any verdict OTHER than needs_clarification.)
 *   - needs_clarification → reason is too vague to judge ("I disagree",
 *                          "this is wrong"); triggers the clarification
 *                          email loop in PR 3.
 *   - applicant_correct  → applicant has a defensible point; AI was wrong
 *                          or partially wrong. Merit confirmed.
 *   - grader_correct     → AI was right; applicant's pushback doesn't
 *                          stand up.
 *   - partial            → both have a point; merit overlap.
 *   - unclear            → substantive but evidence is contradictory or
 *                          ambiguous; HITL helps.
 *
 * Body: { submissionId: string, errorIndex?: number }
 *   - errorIndex omitted: triage every REJECT for this submission that
 *     hasn't been triaged yet.
 *   - errorIndex set: triage just that one row (used by Re-triage button).
 *
 * Idempotent: rows already triaged are skipped unless `force=true`.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TRIAGE_MODEL = "claude-sonnet-4-6";
const TRIAGE_PROMPT_VERSION = "2026-05-01-triage-v1";

const SYSTEM_PROMPT = `You are a senior translation reviewer at CETHOS, judging applicant pushback on automated test grading.

You receive:
- The source segment (in source language)
- The applicant's translation of that span
- A revised translation our AI grader proposed (with <ins> additions and <del> deletions)
- The AI grader's English explanation of why the original was wrong
- The applicant's English rejection reason (their pushback)

Your job: judge whether the applicant's pushback has merit, and how clear it is.

Return ONLY valid JSON, no preamble:
{
  "verdict": "needs_clarification" | "applicant_correct" | "grader_correct" | "partial" | "unclear",
  "confidence": number (0-100),
  "reasoning": string (English, 1-2 sentences, terse)
}

Decision guide:
- "needs_clarification" → applicant's reason is vague, generic, or doesn't actually engage with the AI's claim. Examples: "I disagree", "this is wrong", "the translation is correct". They haven't given enough to judge.
- "applicant_correct" → applicant cites specific terminology, regional usage, document register, or a verifiable fact, AND it convincingly defeats the AI's claim. Confidence ≥ 70 means you'd bet on the applicant.
- "grader_correct" → applicant's pushback doesn't hold up. The AI's claim still stands. Confidence ≥ 70 means clear win for the grader.
- "partial" → both have a point. Maybe the AI's severity is wrong but the issue is real, or the AI's revision is suboptimal but not the applicant's version.
- "unclear" → applicant gave substance, but the evidence is genuinely ambiguous or you'd need a domain expert to settle it. Use this when you can't confidently pick a side.

Confidence 0-100: be honest. Don't inflate. If you'd want a Persian/French/Khmer specialist to verify, say so by lowering confidence even if you have a leaning.

Reasoning: 1-2 sentences in English, citing the specific element you weighed. No hedging filler.`;

interface ErrorSnapshot {
  category?: string;
  severity?: string;
  source_segment?: string;
  applicant_translation?: string;
  revised_translation?: string;
  comment?: string;
  note?: string;
}

interface FeedbackRow {
  id: string;
  error_index: number;
  error_snapshot: ErrorSnapshot;
  applicant_response: "accept" | "reject";
  applicant_reason: string | null;
  auto_triage_verdict: string | null;
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TRIAGE_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Claude API ${response.status}: ${await response.text()}`);
  }
  const result = await response.json();
  const block = result.content?.find((b: { type: string }) => b.type === "text");
  if (!block) throw new Error("no text block");
  return (block as { text: string }).text;
}

function parseJsonResponse(raw: string): {
  verdict: string;
  confidence: number;
  reasoning: string;
} {
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return {
    verdict: typeof parsed.verdict === "string" ? parsed.verdict : "unclear",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

const ALLOWED_VERDICTS = new Set([
  "clear",
  "needs_clarification",
  "applicant_correct",
  "grader_correct",
  "partial",
  "unclear",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { submissionId?: string; errorIndex?: number; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const submissionId = (body.submissionId ?? "").trim();
  if (!submissionId) return json({ success: false, error: "submissionId_required" }, 400);
  const force = body.force === true;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let q = supabase
    .from("cvp_test_error_feedback")
    .select("id, error_index, error_snapshot, applicant_response, applicant_reason, auto_triage_verdict")
    .eq("submission_id", submissionId)
    .eq("applicant_response", "reject"); // accepts don't need triage
  if (typeof body.errorIndex === "number") q = q.eq("error_index", body.errorIndex);
  if (!force) q = q.is("auto_triage_verdict", null);

  const { data: rowsData, error: rowsErr } = await q;
  if (rowsErr) return json({ success: false, error: "fetch_failed", message: rowsErr.message }, 500);
  const rows = (rowsData ?? []) as unknown as FeedbackRow[];

  if (rows.length === 0) {
    return json({ success: true, data: { triaged: 0, skipped: 0, results: [] } });
  }

  const results: Array<Record<string, unknown>> = [];
  let triaged = 0;
  let skipped = 0;

  for (const row of rows) {
    const reason = (row.applicant_reason ?? "").trim();
    if (reason.length === 0) {
      // No reason on a reject — straight to needs_clarification.
      await supabase
        .from("cvp_test_error_feedback")
        .update({
          auto_triage_verdict: "needs_clarification",
          auto_triage_confidence: 100,
          auto_triage_reasoning: "Applicant rejected the finding without supplying any reason.",
          auto_triage_model: TRIAGE_MODEL,
          auto_triage_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ errorIndex: row.error_index, verdict: "needs_clarification", confidence: 100 });
      triaged += 1;
      continue;
    }

    const e = row.error_snapshot ?? {};
    const aiComment = e.comment ?? e.note ?? "(no AI comment recorded)";

    const userMessage = `Triage this rejection.

=== Source segment ===
${e.source_segment ?? "(not recorded)"}

=== Applicant's translation ===
${e.applicant_translation ?? "(not recorded)"}

=== Reviewer's proposed revision ===
${e.revised_translation ?? "(not recorded)"}

=== Reviewer's English comment ===
${aiComment}

=== Applicant's English rejection reason ===
${reason}

=== Error metadata ===
category: ${e.category ?? "?"}, severity: ${e.severity ?? "?"}

Judge the merit of the applicant's pushback per the schema.`;

    try {
      const raw = await callClaude(SYSTEM_PROMPT, userMessage);
      const parsed = parseJsonResponse(raw);
      const verdict = ALLOWED_VERDICTS.has(parsed.verdict) ? parsed.verdict : "unclear";
      const confidence = clampConfidence(parsed.confidence);

      // HITL gating: when verdict is on the applicant's side OR ambiguous AND
      // confidence is low, queue HITL paid review. Confident verdicts skip
      // it (Tier 2 is reserved for the cases auto-triage can't settle).
      const needsHitl =
        ["applicant_correct", "partial", "unclear"].includes(verdict) && confidence < 70;

      const update: Record<string, unknown> = {
        auto_triage_verdict: verdict,
        auto_triage_confidence: confidence,
        auto_triage_reasoning: parsed.reasoning,
        auto_triage_model: TRIAGE_MODEL,
        auto_triage_at: new Date().toISOString(),
      };
      if (needsHitl) {
        update.hitl_status = "queued";
      }

      await supabase.from("cvp_test_error_feedback").update(update).eq("id", row.id);
      results.push({ errorIndex: row.error_index, verdict, confidence, queuedHitl: needsHitl });
      triaged += 1;
    } catch (err) {
      console.error(`triage failed for row ${row.id}:`, err);
      // Mark as unclear with 0 confidence so it doesn't block — staff can re-run.
      await supabase
        .from("cvp_test_error_feedback")
        .update({
          auto_triage_verdict: "unclear",
          auto_triage_confidence: 0,
          auto_triage_reasoning: `Auto-triage failed: ${err instanceof Error ? err.message : String(err)}`,
          auto_triage_model: TRIAGE_MODEL,
          auto_triage_at: new Date().toISOString(),
          hitl_status: "queued",
        })
        .eq("id", row.id);
      results.push({ errorIndex: row.error_index, verdict: "unclear", confidence: 0, error: true });
      skipped += 1;
    }
  }

  return json({
    success: true,
    data: {
      submissionId,
      triaged,
      skipped,
      promptVersion: TRIAGE_PROMPT_VERSION,
      results,
    },
  });
});
