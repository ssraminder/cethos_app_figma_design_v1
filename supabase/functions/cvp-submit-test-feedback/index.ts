/**
 * cvp-submit-test-feedback
 *
 * Vendor portal calls this when an applicant submits per-error feedback on
 * their AI-graded test. Validates the magic-link token, writes one row per
 * responded error into cvp_test_error_feedback, and stamps the round.
 *
 * Idempotent on (submission_id, error_index): re-submission updates the
 * existing row.
 *
 * Auth: token-based (no shared secret needed). The token in the request
 * body must match cvp_test_feedback_rounds.token and not be expired.
 *
 * Body:
 *   {
 *     token: string,
 *     responses: Array<{
 *       errorIndex: number,
 *       response: "accept" | "reject",
 *       reason?: string         // English, required when response=reject
 *     }>
 *   }
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

interface RoundRow {
  submission_id: string;
  combination_id: string;
  token: string;
  expires_at: string;
  status: string;
  staff_skip: boolean;
  applicant_first_view_at: string | null;
}

interface IncomingResponse {
  errorIndex: number;
  response: "accept" | "reject";
  reason?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { token?: string; responses?: IncomingResponse[] } = {};
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const token = (body.token ?? "").trim();
  if (!token) return json({ success: false, error: "token_required" }, 400);
  if (!Array.isArray(body.responses) || body.responses.length === 0) {
    return json({ success: false, error: "responses_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: roundRow } = await supabase
    .from("cvp_test_feedback_rounds")
    .select("submission_id, combination_id, token, expires_at, status, staff_skip, applicant_first_view_at")
    .eq("token", token)
    .maybeSingle();
  if (!roundRow) return json({ success: false, error: "invalid_token" }, 404);
  const round = roundRow as RoundRow;

  if (round.staff_skip) return json({ success: false, error: "feedback_round_disabled" }, 403);
  if (new Date(round.expires_at).getTime() < Date.now()) {
    return json({ success: false, error: "token_expired" }, 410);
  }

  // Pull the AI's error array so we can snapshot each error_index the
  // applicant references — this freezes the AI's claim so a future re-grade
  // doesn't break the link.
  const { data: comboRow } = await supabase
    .from("cvp_test_combinations")
    .select("ai_assessment_result")
    .eq("id", round.combination_id)
    .maybeSingle();
  const errors = Array.isArray(
    (comboRow as { ai_assessment_result?: { errors?: unknown[] } } | null)?.ai_assessment_result?.errors,
  )
    ? (((comboRow as { ai_assessment_result: { errors: unknown[] } }).ai_assessment_result.errors) as unknown[])
    : [];

  const writes: Array<Record<string, unknown>> = [];
  const skipped: Array<{ errorIndex: number; reason: string }> = [];

  for (const r of body.responses) {
    if (typeof r.errorIndex !== "number" || r.errorIndex < 0 || r.errorIndex >= errors.length) {
      skipped.push({ errorIndex: r.errorIndex, reason: "invalid_error_index" });
      continue;
    }
    if (r.response !== "accept" && r.response !== "reject") {
      skipped.push({ errorIndex: r.errorIndex, reason: "invalid_response" });
      continue;
    }
    if (r.response === "reject") {
      const reason = (r.reason ?? "").trim();
      if (reason.length === 0) {
        skipped.push({ errorIndex: r.errorIndex, reason: "reject_requires_reason" });
        continue;
      }
    }
    writes.push({
      submission_id: round.submission_id,
      combination_id: round.combination_id,
      error_index: r.errorIndex,
      error_snapshot: errors[r.errorIndex],
      applicant_response: r.response,
      applicant_reason: r.response === "reject" ? r.reason!.trim().slice(0, 2000) : null,
      applicant_submitted_at: new Date().toISOString(),
    });
  }

  if (writes.length === 0) {
    return json({ success: false, error: "no_valid_responses", skipped }, 400);
  }

  // Upsert by unique (submission_id, error_index) so re-submission overrides.
  const { error: upsertErr } = await supabase
    .from("cvp_test_error_feedback")
    .upsert(writes, { onConflict: "submission_id,error_index" });
  if (upsertErr) {
    console.error("upsert failed:", upsertErr);
    return json({ success: false, error: "upsert_failed", message: upsertErr.message }, 500);
  }

  // Stamp the round.
  const now = new Date().toISOString();
  await supabase
    .from("cvp_test_feedback_rounds")
    .update({
      applicant_submitted_at: now,
      applicant_first_view_at: round.applicant_first_view_at ?? now,
      status: "submitted",
    })
    .eq("submission_id", round.submission_id);

  // Fire-and-forget Tier 1 auto-triage. Runs Sonnet over each rejection
  // and writes verdict + confidence + reasoning back to the rows. Will
  // queue HITL review for low-confidence applicant-correct/partial/unclear
  // outcomes. Doesn't block the response — applicant moves on either way.
  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    fetch(`${supabaseUrl}/functions/v1/cvp-triage-test-feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ submissionId: round.submission_id }),
    }).catch((err) => console.error("auto-triage trigger failed:", err));
  } catch (e) {
    console.error("auto-triage error:", e);
  }

  return json({
    success: true,
    data: {
      submissionId: round.submission_id,
      recorded: writes.length,
      skipped,
    },
  });
});
