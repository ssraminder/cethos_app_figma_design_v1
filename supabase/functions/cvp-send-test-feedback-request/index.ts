/**
 * cvp-send-test-feedback-request
 *
 * Issues a magic-link feedback round: writes a cvp_test_feedback_rounds row
 * (with a 4-day token), then sends V22 to the applicant with a link to the
 * vendor portal page where they review each finding.
 *
 * Modes:
 *   - normal:  request body has just `submissionId` → email goes to the
 *              applicant on file. Used by the auto-send hook (PR 2).
 *   - smoke:   `recipientOverride` is set → email goes to that address
 *              instead. The DB row is still created so the smoke link is
 *              fully functional, but no real applicant is bothered.
 *
 * Idempotent: re-issuing for an existing submission returns the existing
 * round (and re-sends only if `forceResend=true` is passed).
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV22TestFeedbackRequest } from "../_shared/email-templates.ts";

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

// Same convention as cvp-check-test-followups / cvp-request-references —
// applicant-facing URLs all go to APP_URL (defaults to https://join.cethos.com).
const FEEDBACK_PUBLIC_URL_BASE = Deno.env.get("APP_URL") ?? "https://join.cethos.com";

function makeToken(): string {
  // 64 chars of url-safe base64 from 32 random bytes — enough entropy.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface AppRow {
  id: string;
  application_number: string;
  full_name: string;
  email: string;
}
interface ComboRow {
  id: string;
  domain: string | null;
  source_language_id: string;
  target_language_id: string;
  ai_score: number | null;
  ai_assessment_result: Record<string, unknown> | null;
}
interface SubmissionRow {
  id: string;
  combination_id: string;
  application_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    submissionId?: string;
    recipientOverride?: string;
    forceResend?: boolean;
    skipApplicantEmail?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const submissionId = (body.submissionId ?? "").trim();
  if (!submissionId) return json({ success: false, error: "submissionId_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // 1) Load submission + combination + applicant.
  const { data: subRow } = await supabase
    .from("cvp_test_submissions")
    .select("id, combination_id, application_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!subRow) return json({ success: false, error: "submission_not_found" }, 404);
  const sub = subRow as SubmissionRow;

  const { data: comboRow } = await supabase
    .from("cvp_test_combinations")
    .select("id, domain, source_language_id, target_language_id, ai_score, ai_assessment_result")
    .eq("id", sub.combination_id)
    .maybeSingle();
  if (!comboRow) return json({ success: false, error: "combination_not_found" }, 404);
  const combo = comboRow as ComboRow;

  const { data: appRow } = await supabase
    .from("cvp_applications")
    .select("id, application_number, full_name, email")
    .eq("id", sub.application_id)
    .maybeSingle();
  if (!appRow) return json({ success: false, error: "application_not_found" }, 404);
  const app = appRow as AppRow;

  // 2) Existing round? Re-issue only if forceResend.
  const { data: existing } = await supabase
    .from("cvp_test_feedback_rounds")
    .select("submission_id, token, status, expires_at")
    .eq("submission_id", sub.id)
    .maybeSingle();

  let token: string;
  if (existing && !body.forceResend) {
    token = (existing as { token: string }).token;
  } else {
    token = makeToken();
    if (existing) {
      await supabase
        .from("cvp_test_feedback_rounds")
        .update({
          token,
          v12_sent_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          status: "sent",
          staff_skip: false,
        })
        .eq("submission_id", sub.id);
    } else {
      await supabase.from("cvp_test_feedback_rounds").insert({
        submission_id: sub.id,
        combination_id: combo.id,
        token,
        status: "sent",
      });
    }
  }

  // 3) Resolve language pair label for the email.
  const { data: langs } = await supabase
    .from("languages")
    .select("id, name")
    .in("id", [combo.source_language_id, combo.target_language_id]);
  const langMap = new Map<string, string>();
  for (const l of (langs ?? []) as Array<{ id: string; name: string }>) langMap.set(l.id, l.name);
  const pair = `${langMap.get(combo.source_language_id) ?? "?"}→${langMap.get(combo.target_language_id) ?? "?"}`;

  // 4) Count errors from the AI assessment so the email can say "12 findings".
  const errors = Array.isArray(
    (combo.ai_assessment_result as Record<string, unknown> | null)?.errors,
  )
    ? ((combo.ai_assessment_result as Record<string, unknown>).errors as unknown[])
    : [];
  const errorCount = errors.length;

  if (errorCount === 0) {
    return json(
      {
        success: false,
        error: "no_errors_to_review",
        message: "This submission has no per-error findings — feedback round is moot.",
      },
      400,
    );
  }

  // 5) Build the link + send V22.
  const reviewUrl = `${FEEDBACK_PUBLIC_URL_BASE.replace(/\/$/, "")}/test-feedback/${token}`;
  const tpl = buildV22TestFeedbackRequest({
    fullName: app.full_name,
    applicationNumber: app.application_number,
    reviewUrl,
    expiresInDays: 4,
    errorCount,
    overallScore: combo.ai_score,
    pair,
  });

  const recipient = body.recipientOverride && body.recipientOverride.includes("@")
    ? body.recipientOverride
    : app.email;
  const isSmoke = !!body.recipientOverride && body.recipientOverride !== app.email;

  if (!body.skipApplicantEmail) {
    try {
      await sendMailgunEmail({
        to: { email: recipient, name: isSmoke ? `Smoke (${app.full_name})` : app.full_name },
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        respectDoNotContactFor: isSmoke ? null : recipient,
        tags: ["v22-test-feedback-request", sub.application_id, isSmoke ? "smoke" : "normal"],
      });
    } catch (mailErr) {
      console.error("V22 send failed:", mailErr);
      return json(
        {
          success: false,
          error: "email_send_failed",
          message: mailErr instanceof Error ? mailErr.message : String(mailErr),
        },
        500,
      );
    }
  }

  return json({
    success: true,
    data: {
      submissionId: sub.id,
      token,
      reviewUrl,
      sentTo: recipient,
      smoke: isSmoke,
      errorCount,
    },
  });
});
