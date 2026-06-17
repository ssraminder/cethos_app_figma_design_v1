/**
 * cvp-get-test-feedback-context
 *
 * Token-authed read for the vendor-facing feedback page. Returns the AI
 * assessment + applicant + combo metadata so the page can render the LQA
 * edit log without ever holding a service-role key client-side.
 *
 * Marks first-view timestamp on the round when called, so we can later
 * remind only applicants who never opened the link.
 *
 * Body: { token: string }
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       applicantFirstName, applicationNumber, pair, domain, overallScore,
 *       feedbackDraft, expiresAt,
 *       errors: [{ index, category, severity, location, source_segment,
 *                  applicant_translation, revised_translation, comment }],
 *       existingResponses: [{ errorIndex, response, reason }]
 *     }
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const token = (body.token ?? "").trim();
  if (!token) return json({ success: false, error: "token_required" }, 400);

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
  const round = roundRow as {
    submission_id: string;
    combination_id: string;
    expires_at: string;
    status: string;
    staff_skip: boolean;
    applicant_first_view_at: string | null;
  };

  if (round.staff_skip) return json({ success: false, error: "feedback_round_disabled" }, 403);
  const expired = new Date(round.expires_at).getTime() < Date.now();

  const { data: subRow } = await supabase
    .from("cvp_test_submissions")
    .select("id, application_id")
    .eq("id", round.submission_id)
    .maybeSingle();
  if (!subRow) return json({ success: false, error: "submission_not_found" }, 404);
  const sub = subRow as { id: string; application_id: string };

  const { data: comboRow } = await supabase
    .from("cvp_test_combinations")
    .select("id, domain, source_language_id, target_language_id, ai_score, ai_assessment_result")
    .eq("id", round.combination_id)
    .maybeSingle();
  if (!comboRow) return json({ success: false, error: "combination_not_found" }, 404);
  const combo = comboRow as {
    id: string;
    domain: string | null;
    source_language_id: string;
    target_language_id: string;
    ai_score: number | null;
    ai_assessment_result: Record<string, unknown> | null;
  };

  const { data: appRow } = await supabase
    .from("cvp_applications")
    .select("application_number, full_name")
    .eq("id", sub.application_id)
    .maybeSingle();
  const app = (appRow ?? { application_number: "", full_name: "" }) as {
    application_number: string;
    full_name: string;
  };

  const { data: langs } = await supabase
    .from("languages")
    .select("id, name, code")
    .in("id", [combo.source_language_id, combo.target_language_id]);
  const langMap = new Map<string, { name: string; code: string | null }>();
  for (const l of (langs ?? []) as Array<{ id: string; name: string; code: string | null }>) {
    langMap.set(l.id, { name: l.name, code: l.code });
  }
  const srcInfo = langMap.get(combo.source_language_id);
  const tgtInfo = langMap.get(combo.target_language_id);
  const pair = `${srcInfo?.name ?? "?"} → ${tgtInfo?.name ?? "?"}`;

  const RTL_CODES = new Set([
    "ar", "ar-EG", "ar-SA", "ar-LB", "ar-MA",
    "he", "fa", "prs", "ps", "ur", "ckb", "yi",
  ]);
  const isRtlCode = (code: string | null | undefined) =>
    !!code && (RTL_CODES.has(code) || code.startsWith("ar-"));
  const sourceLanguageCode = srcInfo?.code ?? null;
  const targetLanguageCode = tgtInfo?.code ?? null;

  const aiResult = (combo.ai_assessment_result ?? {}) as Record<string, unknown>;
  const rawErrors = Array.isArray(aiResult.errors) ? (aiResult.errors as Array<Record<string, unknown>>) : [];
  const errors = rawErrors.map((e, i) => ({
    index: i,
    category: typeof e.category === "string" ? e.category : null,
    severity: typeof e.severity === "string" ? e.severity : null,
    location: typeof e.location === "string" ? e.location : null,
    source_segment: typeof e.source_segment === "string" ? e.source_segment : null,
    applicant_translation: typeof e.applicant_translation === "string" ? e.applicant_translation : null,
    revised_translation: typeof e.revised_translation === "string" ? e.revised_translation : null,
    comment: typeof e.comment === "string"
      ? e.comment
      : typeof e.note === "string"
      ? e.note
      : null, // legacy graders used "note"
  }));

  const { data: existing } = await supabase
    .from("cvp_test_error_feedback")
    .select("error_index, applicant_response, applicant_reason")
    .eq("submission_id", round.submission_id);
  const existingResponses = (existing ?? []).map((r) => ({
    errorIndex: (r as { error_index: number }).error_index,
    response: (r as { applicant_response: "accept" | "reject" }).applicant_response,
    reason: (r as { applicant_reason: string | null }).applicant_reason,
  }));

  // Mark first view if not yet viewed.
  if (!round.applicant_first_view_at) {
    await supabase
      .from("cvp_test_feedback_rounds")
      .update({ applicant_first_view_at: new Date().toISOString(), status: "opened" })
      .eq("submission_id", round.submission_id);
  }

  return json({
    success: true,
    data: {
      applicantFirstName: app.full_name.split(" ")[0] ?? "",
      applicationNumber: app.application_number,
      pair,
      sourceLanguageCode,
      targetLanguageCode,
      sourceLanguageRtl: isRtlCode(sourceLanguageCode),
      targetLanguageRtl: isRtlCode(targetLanguageCode),
      domain: combo.domain,
      overallScore: combo.ai_score,
      feedbackDraft: typeof aiResult.feedback_draft === "string" ? aiResult.feedback_draft : null,
      strengths: Array.isArray(aiResult.strengths) ? aiResult.strengths : [],
      expiresAt: round.expires_at,
      expired,
      alreadySubmitted: round.status === "submitted",
      errors,
      existingResponses,
    },
  });
});
