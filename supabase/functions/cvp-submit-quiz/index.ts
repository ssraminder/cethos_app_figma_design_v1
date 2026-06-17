// ============================================================================
// cvp-submit-quiz
//
// Applicant-facing. Accepts the applicant's MCQ responses, scores them
// deterministically server-side against iso_competence_quizzes.correct_option,
// persists the score breakdown, marks affected combinations as quiz-routed,
// applies the threshold-based routing (>=80 approved / 70-79 staff_review /
// <70 rejected), sends an applicant confirmation, and notifies staff.
//
// Companion to docs/qms/02-test-or-quiz-routing.md §2 + §5.
//
// POST /functions/v1/cvp-submit-quiz
// Body: { token: string, responses: [{question_id, selected_option}, ...] }
// Returns: { success, data: { submissionId, submittedAt } }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail, sendMailgunOperationalEmail } from "../_shared/mailgun.ts";
import { buildV7TestReceived } from "../_shared/email-templates.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_PORTAL_URL =
  Deno.env.get("ADMIN_PORTAL_URL") ?? "https://portal.cethos.com";
const FALLBACK_OPS_EMAIL =
  Deno.env.get("CVP_RECRUITMENT_OPS_EMAIL") ?? "vm@cethos.com";

// Pass thresholds — docs/qms/02-test-or-quiz-routing.md §2
const APPROVE_THRESHOLD = 80;
const STAFF_REVIEW_THRESHOLD = 70;

interface SubmissionRow {
  id: string;
  application_id: string;
  target_language_id: string;
  token: string;
  token_expires_at: string;
  status: string;
}

interface ResponseItem {
  question_id: string;
  selected_option: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: { token?: string; responses?: ResponseItem[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const token = (body.token ?? "").trim();
  const responses = Array.isArray(body.responses) ? body.responses : [];
  if (!token) {
    return jsonResponse({ success: false, error: "Token is required" }, 400);
  }
  if (responses.length === 0) {
    return jsonResponse(
      { success: false, error: "No responses provided." },
      400,
    );
  }

  // 1. Load submission
  const { data: subData, error: subErr } = await supabase
    .from("cvp_quiz_submissions")
    .select("id, application_id, target_language_id, token, token_expires_at, status")
    .eq("token", token)
    .maybeSingle();
  if (subErr || !subData) {
    return jsonResponse({ success: false, error: "Invalid quiz link." }, 404);
  }
  const sub = subData as SubmissionRow;

  if (sub.status === "submitted" || sub.status === "archived") {
    return jsonResponse(
      {
        success: false,
        error: "already_submitted",
        message: "This quiz has already been submitted.",
      },
      400,
    );
  }

  const now = new Date();
  if (now > new Date(sub.token_expires_at)) {
    await supabase
      .from("cvp_quiz_submissions")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("id", sub.id);
    return jsonResponse(
      {
        success: false,
        error: "token_expired",
        message: "This quiz link has expired.",
      },
      400,
    );
  }

  // 2. Load correct answers for every question_id in the response
  const questionIds = Array.from(new Set(responses.map((r) => r.question_id))).filter(Boolean);
  if (questionIds.length === 0) {
    return jsonResponse(
      { success: false, error: "Response objects must include question_id." },
      400,
    );
  }

  const { data: keyData, error: keyErr } = await supabase
    .from("iso_competence_quizzes")
    .select("id, competence_slug, correct_option")
    .in("id", questionIds);
  if (keyErr) {
    console.error("cvp-submit-quiz answer-key load failed:", keyErr);
    return jsonResponse(
      { success: false, error: "Failed to score quiz. Please try again." },
      500,
    );
  }
  const key = new Map<string, { competence: string; correct: string }>();
  for (const row of (keyData ?? []) as Array<{ id: string; competence_slug: string; correct_option: string }>) {
    key.set(row.id, { competence: row.competence_slug, correct: row.correct_option });
  }

  // 3. Score deterministically
  let correctCount = 0;
  const totalCount = responses.length;
  const breakdown: Record<string, { correct: number; total: number }> = {};

  for (const r of responses) {
    const k = key.get(r.question_id);
    if (!k) continue; // unknown question_id — skip (counts as wrong by not incrementing)
    if (!breakdown[k.competence]) breakdown[k.competence] = { correct: 0, total: 0 };
    breakdown[k.competence].total += 1;
    if (String(r.selected_option).toLowerCase() === String(k.correct).toLowerCase()) {
      correctCount += 1;
      breakdown[k.competence].correct += 1;
    }
  }
  const scorePct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  // 4. Persist submission
  const { error: updateErr } = await supabase
    .from("cvp_quiz_submissions")
    .update({
      status: "submitted",
      responses,
      score_pct: Number(scorePct.toFixed(2)),
      correct_count: correctCount,
      total_count: totalCount,
      competence_breakdown: breakdown,
      submitted_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", sub.id);
  if (updateErr) {
    console.error("cvp-submit-quiz persist failed:", updateErr);
    return jsonResponse(
      { success: false, error: "Failed to record submission. Please try again." },
      500,
    );
  }

  // 5. Apply routing to all combinations of this applicant targeting the
  // quiz's target_language. Quiz settles all of them as a group.
  let comboStatus: string;
  if (scorePct >= APPROVE_THRESHOLD) comboStatus = "approved";
  else if (scorePct >= STAFF_REVIEW_THRESHOLD) comboStatus = "assessed"; // staff review
  else comboStatus = "rejected";

  const comboUpdate: Record<string, unknown> = {
    status: comboStatus,
    instrument_kind: "quiz",
    updated_at: now.toISOString(),
  };
  if (comboStatus === "approved") {
    comboUpdate.approved_at = now.toISOString();
  }
  await supabase
    .from("cvp_test_combinations")
    .update(comboUpdate)
    .eq("application_id", sub.application_id)
    .eq("target_language_id", sub.target_language_id)
    .in("status", ["pending", "test_sent", "test_submitted", "assessed"]);

  // 6. Update application-level status. Mirrors cvp-assess-test logic.
  // If all combos across all languages are settled, flip application to
  // staff_review (or rejected if every combo rejected).
  const { data: allCombos } = await supabase
    .from("cvp_test_combinations")
    .select("status")
    .eq("application_id", sub.application_id);
  const combos =
    (allCombos as { status: string }[] | null) ?? [];
  const allSettled = combos.every((c) =>
    ["approved", "rejected", "assessed", "skipped", "no_test_available", "skip_manual_review"].includes(c.status),
  );
  if (allSettled) {
    const hasApproved = combos.some((c) => c.status === "approved");
    const hasAssessed = combos.some((c) => c.status === "assessed");
    const allRejected = combos
      .filter((c) => !["skipped", "no_test_available", "skip_manual_review"].includes(c.status))
      .every((c) => c.status === "rejected");

    let appStatus: string;
    if (hasAssessed) appStatus = "staff_review";
    else if (allRejected) appStatus = "rejected";
    else if (hasApproved) appStatus = "test_assessed";
    else appStatus = "staff_review";

    await supabase
      .from("cvp_applications")
      .update({ status: appStatus, updated_at: now.toISOString() })
      .eq("id", sub.application_id);
  }

  // 7. Applicant confirmation email (reuse V7 — wording is generic enough).
  const { data: appData } = await supabase
    .from("cvp_applications")
    .select("email, full_name, application_number")
    .eq("id", sub.application_id)
    .maybeSingle();
  const app = (appData as {
    email: string;
    full_name: string;
    application_number: string;
  } | null) ?? null;
  if (app) {
    const tpl = buildV7TestReceived({
      fullName: app.full_name,
      applicationNumber: app.application_number,
    });
    await sendMailgunEmail({
      to: { email: app.email, name: app.full_name },
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      respectDoNotContactFor: app.email,
      tags: ["v7-quiz-received", sub.application_id],
    });
  }

  // 8. Staff notification — mirrors the cvp-submit-test staff email.
  try {
    const { data: graderRows } = await supabase
      .from("staff_users")
      .select("email, full_name")
      .eq("role", "recruitment_grader")
      .eq("is_active", true);
    const graders =
      (graderRows as { email: string; full_name: string }[] | null) ?? [];
    const recipients = graders.length > 0
      ? graders.map((g) => ({ email: g.email, name: g.full_name }))
      : [{ email: FALLBACK_OPS_EMAIL, name: "Recruitment Ops" }];

    const reviewUrl = `${ADMIN_PORTAL_URL.replace(/\/$/, "")}/admin/recruitment/${sub.application_id}`;
    const applicationNumber = app?.application_number ?? "(unknown)";
    const applicantName = app?.full_name ?? "(unknown)";

    const verdictLabel =
      comboStatus === "approved"
        ? "Auto-approved"
        : comboStatus === "assessed"
          ? "Staff review needed"
          : "Auto-rejected";

    const breakdownRows = Object.entries(breakdown)
      .map(
        ([slug, b]) =>
          `<tr><td style="padding:2px 12px 2px 0;color:#6B7280;">${slug.replace(/_/g, " ")}</td><td style="padding:2px 0;font-weight:600;">${b.correct} / ${b.total}</td></tr>`,
      )
      .join("");

    const subject = `Quiz submitted: ${applicationNumber} — ${scorePct.toFixed(1)}% (${verdictLabel})`;
    const html = `
      <p>An ISO competence quiz just landed.</p>
      <table style="border-collapse:collapse;font-size:14px;margin:12px 0;">
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280;">Application</td><td style="padding:4px 0;font-weight:600;">${applicationNumber}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280;">Applicant</td><td style="padding:4px 0;">${applicantName}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280;">Score</td><td style="padding:4px 0;font-weight:600;">${scorePct.toFixed(1)}% (${correctCount} / ${totalCount})</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280;">Verdict</td><td style="padding:4px 0;">${verdictLabel}</td></tr>
      </table>
      <table style="border-collapse:collapse;font-size:13px;margin:8px 0 16px;">${breakdownRows}</table>
      <p><a href="${reviewUrl}" style="display:inline-block;background:#0891B2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Review application</a></p>
    `;
    const text =
      `Quiz submitted: ${applicationNumber} (${applicantName})\n` +
      `Score: ${scorePct.toFixed(1)}% (${correctCount}/${totalCount})\n` +
      `Verdict: ${verdictLabel}\n\n` +
      `Review: ${reviewUrl}\n`;

    for (const r of recipients) {
      await sendMailgunOperationalEmail({
        to: r,
        subject,
        html,
        text,
        tags: ["staff-quiz-submitted", sub.application_id],
      });
    }
  } catch (notifyErr) {
    console.error("Staff quiz notification failed:", notifyErr);
  }

  return jsonResponse({
    success: true,
    data: {
      submissionId: sub.id,
      submittedAt: now.toISOString(),
      scorePct: Number(scorePct.toFixed(2)),
      verdict: comboStatus,
    },
  });
});
