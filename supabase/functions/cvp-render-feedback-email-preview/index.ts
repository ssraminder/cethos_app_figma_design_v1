/**
 * cvp-render-feedback-email-preview
 *
 * Read-only renderer for the V22 email body. Lets the admin recruitment UI
 * show "what the applicant will see" without sending a smoke email or
 * exposing the email-templates module to the client bundle.
 *
 * Returns { subject, html, text } for the exact submission. No state changes.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildV22TestFeedbackRequest } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FEEDBACK_PUBLIC_URL_BASE =
  Deno.env.get("APP_URL") ?? "https://join.cethos.com";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  let body: { submissionId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const submissionId = (body.submissionId ?? "").trim();
  if (!submissionId) {
    return jsonResponse({ success: false, error: "submissionId_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: subRow } = await supabase
    .from("cvp_test_submissions")
    .select("id, combination_id, application_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!subRow) return jsonResponse({ success: false, error: "submission_not_found" }, 404);
  const sub = subRow as { id: string; combination_id: string; application_id: string };

  const { data: comboRow } = await supabase
    .from("cvp_test_combinations")
    .select("id, source_language_id, target_language_id, ai_score, ai_assessment_result")
    .eq("id", sub.combination_id)
    .maybeSingle();
  if (!comboRow) return jsonResponse({ success: false, error: "combination_not_found" }, 404);
  const combo = comboRow as {
    source_language_id: string;
    target_language_id: string;
    ai_score: number | null;
    ai_assessment_result: Record<string, unknown> | null;
  };

  const { data: appRow } = await supabase
    .from("cvp_applications")
    .select("id, application_number, full_name")
    .eq("id", sub.application_id)
    .maybeSingle();
  if (!appRow) return jsonResponse({ success: false, error: "application_not_found" }, 404);
  const app = appRow as { application_number: string; full_name: string };

  // The token comes from the existing feedback round if any; otherwise we
  // synthesize a placeholder so the admin sees a structurally accurate
  // preview without minting a real reusable token.
  const { data: roundRow } = await supabase
    .from("cvp_test_feedback_rounds")
    .select("token")
    .eq("submission_id", submissionId)
    .maybeSingle();
  const token = (roundRow as { token: string } | null)?.token ?? "preview-token-not-real";

  const { data: langs } = await supabase
    .from("languages")
    .select("id, name")
    .in("id", [combo.source_language_id, combo.target_language_id]);
  const langMap = new Map<string, string>();
  for (const l of (langs ?? []) as Array<{ id: string; name: string }>) {
    langMap.set(l.id, l.name);
  }
  const pair = `${langMap.get(combo.source_language_id) ?? "?"}→${
    langMap.get(combo.target_language_id) ?? "?"
  }`;

  const errors = Array.isArray(
    (combo.ai_assessment_result as Record<string, unknown> | null)?.errors,
  )
    ? ((combo.ai_assessment_result as Record<string, unknown>).errors as unknown[])
    : [];

  const reviewUrl = `${FEEDBACK_PUBLIC_URL_BASE.replace(/\/$/, "")}/test-feedback/${token}`;
  const tpl = buildV22TestFeedbackRequest({
    fullName: app.full_name,
    applicationNumber: app.application_number,
    reviewUrl,
    expiresInDays: 4,
    errorCount: errors.length,
    overallScore: combo.ai_score,
    pair,
  });

  return jsonResponse({
    success: true,
    data: {
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      reviewUrl,
    },
  });
});
