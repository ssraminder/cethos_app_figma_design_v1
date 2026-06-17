// ============================================================================
// cvp-record-instrument-choice
//
// Applicant-facing endpoint hit by the "Choose your assessment" landing page.
// Records the applicant's selection on cvp_applications.instrument_choice,
// then dispatches the appropriate instrument(s):
//   - choice='test' → call cvp-send-tests with sourceLanguageFilter=English
//                     (currently EN→Target only per user policy 2026-05-15)
//   - choice='quiz' → for each distinct target_language across pending combos,
//                     insert a cvp_quiz_submissions row + send V8 quiz-link email
//
// Companion to docs/qms/02-test-or-quiz-routing.md §5.
//
// POST /functions/v1/cvp-record-instrument-choice
// Body:
//   - Applicant flow: { token: string, choice: 'test'|'quiz' }
//   - Staff override flow: { applicationId: string, choice, staffId: uuid }
// Returns: { success, data: { applicationId, choice, dispatched } }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = Deno.env.get("APP_URL") ?? "https://join.cethos.com";

// Quiz token TTL: same 10-day window as translation tests
const QUIZ_TTL_MS = 10 * 24 * 60 * 60 * 1000;

interface Body {
  token?: string;
  applicationId?: string;
  choice?: string;
  staffId?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const choice = (body.choice ?? "").trim();
  if (!["test", "quiz"].includes(choice)) {
    return jsonResponse(
      { success: false, error: "choice must be 'test' or 'quiz'" },
      400,
    );
  }

  // Two entry modes:
  //   - Applicant: { token, choice } — token is the cvp-send-tests invitation
  //     token recorded on cvp_applications (see P1.4 refactor).
  //   - Staff: { applicationId, choice, staffId } — bypass the chooser.
  let applicationId: string | null = null;
  let chooserStaffId: string | null = null;

  if (body.applicationId && body.staffId) {
    // Staff override path
    applicationId = body.applicationId;
    chooserStaffId = body.staffId;
    // Validate staff user is active
    const { data: staffRow } = await supabase
      .from("staff_users")
      .select("id, is_active")
      .eq("id", chooserStaffId)
      .maybeSingle();
    if (!staffRow || !(staffRow as { is_active: boolean }).is_active) {
      return jsonResponse(
        { success: false, error: "invalid_or_inactive_staff" },
        403,
      );
    }
  } else if (body.token) {
    // Applicant path — resolve application by invitation token.
    const { data: appRow, error: appErr } = await supabase
      .from("cvp_applications")
      .select("id, instrument_choice")
      .eq("instrument_choice_token", body.token)
      .maybeSingle();
    if (appErr || !appRow) {
      return jsonResponse({ success: false, error: "Invalid invitation token." }, 404);
    }
    if ((appRow as { instrument_choice: string | null }).instrument_choice) {
      return jsonResponse(
        {
          success: false,
          error: "already_chosen",
          message:
            "You have already chosen your assessment. Contact recruitment@cethos.com if you need to switch.",
        },
        400,
      );
    }
    applicationId = (appRow as { id: string }).id;
  } else {
    return jsonResponse(
      { success: false, error: "Provide either {token, choice} or {applicationId, choice, staffId}" },
      400,
    );
  }

  if (!applicationId) {
    return jsonResponse({ success: false, error: "could_not_resolve_application" }, 500);
  }

  // Record the choice on cvp_applications
  const now = new Date();
  const { error: choiceErr } = await supabase
    .from("cvp_applications")
    .update({
      instrument_choice: choice,
      instrument_choice_at: now.toISOString(),
      instrument_choice_by: chooserStaffId,
      updated_at: now.toISOString(),
    })
    .eq("id", applicationId);
  if (choiceErr) {
    console.error("Failed to record instrument_choice:", choiceErr);
    return jsonResponse(
      { success: false, error: "Failed to record your choice. Please try again." },
      500,
    );
  }

  // Dispatch
  let dispatched: Record<string, unknown> = {};
  if (choice === "test") {
    dispatched = await dispatchTestPath(supabase, applicationId, chooserStaffId);
  } else {
    dispatched = await dispatchQuizPath(supabase, applicationId);
  }

  return jsonResponse({
    success: true,
    data: { applicationId, choice, dispatched },
  });
});

// ----------------------------------------------------------------------------
// Dispatch helpers
// ----------------------------------------------------------------------------

async function dispatchTestPath(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
  staffId: string | null,
): Promise<Record<string, unknown>> {
  // Resolve English language IDs (and equivalent variants) to enforce
  // EN→Target only per policy 2026-05-15.
  const { data: enLangs } = await supabase
    .from("languages")
    .select("id, name")
    .ilike("name", "English%");
  const englishIds = ((enLangs ?? []) as { id: string }[]).map((l) => l.id);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Restrict to EN→Target + general domain. Non-general domains (legal,
  // medical, certified_official) stay pending and are staff-driven later,
  // matching the pre-existing auto-send-General policy.
  const resp = await fetch(`${supabaseUrl}/functions/v1/cvp-send-tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      applicationId,
      sourceLanguageFilter: englishIds,
      domainFilter: ["general"],
      staffId,
    }),
  });
  const respBody = await resp.json().catch(() => ({}));
  return { kind: "test", cvpSendTests: respBody };
}

async function dispatchQuizPath(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
): Promise<Record<string, unknown>> {
  // Find distinct target languages across pending EN→Target combos.
  const { data: enLangs } = await supabase
    .from("languages")
    .select("id")
    .ilike("name", "English%");
  const englishIds = ((enLangs ?? []) as { id: string }[]).map((l) => l.id);

  const { data: combos, error: comboErr } = await supabase
    .from("cvp_test_combinations")
    .select("id, target_language_id, source_language_id, domain, status")
    .eq("application_id", applicationId)
    .eq("domain", "general")
    .in("status", ["pending", "test_sent", "skip_manual_review"])
    .in("source_language_id", englishIds);
  if (comboErr) {
    console.error("dispatchQuizPath combos query failed:", comboErr);
    return { kind: "quiz", error: comboErr.message };
  }

  const distinctTargets = Array.from(
    new Set(((combos ?? []) as { target_language_id: string }[]).map((c) => c.target_language_id)),
  );
  if (distinctTargets.length === 0) {
    return { kind: "quiz", warning: "No pending EN→Target combinations to quiz." };
  }

  // For each target language: verify quiz pool coverage (must have at least
  // 8 active rows for each of the 3 target-scoped competences), then create
  // one cvp_quiz_submissions row + send the V8 invitation email.
  const issued: Array<{ targetLanguageId: string; tokenUrl: string }> = [];
  const skipped: Array<{ targetLanguageId: string; reason: string }> = [];

  for (const targetLanguageId of distinctTargets) {
    const coverage = await checkQuizCoverage(supabase, targetLanguageId);
    if (!coverage.ok) {
      skipped.push({ targetLanguageId, reason: coverage.reason });
      continue;
    }

    const expiresAt = new Date(Date.now() + QUIZ_TTL_MS).toISOString();
    const { data: inserted, error: insertErr } = await supabase
      .from("cvp_quiz_submissions")
      .insert({
        application_id: applicationId,
        target_language_id: targetLanguageId,
        token_expires_at: expiresAt,
        status: "sent",
      })
      .select("id, token")
      .single();
    if (insertErr || !inserted) {
      console.error(`Quiz insert failed for ${targetLanguageId}:`, insertErr);
      skipped.push({ targetLanguageId, reason: "insert_failed" });
      continue;
    }

    const insertedRow = inserted as { id: string; token: string };
    const quizUrl = `${APP_URL.replace(/\/$/, "")}/quiz/${insertedRow.token}`;
    issued.push({ targetLanguageId, tokenUrl: quizUrl });

    // Mark this language's pending combos as routed-to-quiz
    await supabase
      .from("cvp_test_combinations")
      .update({
        instrument_kind: "quiz",
        status: "test_sent", // re-uses existing combo lifecycle; flips to approved/assessed/rejected on submit
        updated_at: new Date().toISOString(),
      })
      .eq("application_id", applicationId)
      .eq("target_language_id", targetLanguageId)
      .eq("domain", "general")
      .in("source_language_id", englishIds)
      .in("status", ["pending", "skip_manual_review"]);
  }

  // Send one V8 email per applicant with all issued quiz links bundled.
  if (issued.length > 0) {
    await sendV8QuizInvitation(supabase, applicationId, issued);
  }

  return { kind: "quiz", issued, skipped };
}

async function checkQuizCoverage(
  supabase: ReturnType<typeof createClient>,
  targetLanguageId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Need at least 8 active questions per target-scoped competence.
  const targetCompetences = [
    "linguistic_textual_competence",
    "cultural_competence",
    "domain_competence",
  ];
  for (const slug of targetCompetences) {
    const { count } = await supabase
      .from("iso_competence_quizzes")
      .select("id", { count: "exact", head: true })
      .eq("competence_slug", slug)
      .eq("active", true)
      .eq("target_language_id", targetLanguageId);
    if ((count ?? 0) < 8) {
      return {
        ok: false,
        reason: `insufficient_${slug}_questions (have ${count ?? 0}, need 8)`,
      };
    }
  }
  // Cross-language baseline check (research + technical)
  const baselineCompetences = ["research_competence", "technical_competence"];
  for (const slug of baselineCompetences) {
    const { count } = await supabase
      .from("iso_competence_quizzes")
      .select("id", { count: "exact", head: true })
      .eq("competence_slug", slug)
      .eq("active", true)
      .is("target_language_id", null);
    if ((count ?? 0) < 8) {
      return {
        ok: false,
        reason: `insufficient_baseline_${slug}_questions (have ${count ?? 0}, need 8)`,
      };
    }
  }
  return { ok: true };
}

async function sendV8QuizInvitation(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
  issued: Array<{ targetLanguageId: string; tokenUrl: string }>,
): Promise<void> {
  // Look up applicant + language names
  const { data: appRow } = await supabase
    .from("cvp_applications")
    .select("email, full_name, application_number")
    .eq("id", applicationId)
    .maybeSingle();
  const app = appRow as {
    email: string;
    full_name: string;
    application_number: string;
  } | null;
  if (!app) return;

  const langIds = issued.map((i) => i.targetLanguageId);
  const { data: langs } = await supabase
    .from("languages")
    .select("id, name")
    .in("id", langIds);
  const langName = new Map<string, string>();
  for (const l of ((langs ?? []) as { id: string; name: string }[])) {
    langName.set(l.id, l.name);
  }

  const isMulti = issued.length > 1;
  const linksHtml = issued
    .map(
      (i) => `
        <div style="margin: 14px 0; padding: 14px 16px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px;">
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">Target language</div>
          <div style="font-size: 16px; font-weight: 600; color: #0C2340; margin-bottom: 10px;">${esc(langName.get(i.targetLanguageId) ?? "(unknown)")}</div>
          <a href="${esc(i.tokenUrl)}" style="display: inline-block; background: #0891B2; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; font-size: 14px;">Open quiz</a>
        </div>`,
    )
    .join("");

  const subject = `Your Cethos quiz ${isMulti ? "links are" : "is"} ready · ${app.application_number}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827;">
      <p>Hi ${esc(app.full_name)},</p>
      <p>You chose to demonstrate competence via the <strong>ISO competence quiz</strong> for application <strong>${esc(app.application_number)}</strong>.</p>
      <p>${isMulti ? `Below are the ${issued.length} quizzes` : `Below is the quiz`} you need to complete — one per target language. Each is 40 questions, multiple choice, and should take about 20–30 minutes.</p>
      ${linksHtml}
      <p style="font-size: 13px; color: #6B7280; margin-top: 24px;">
        <strong>Heads up:</strong> each link expires in <strong>240 hours</strong> and can only be used once. Your quiz auto-saves as you progress.
      </p>
      <p style="font-size: 13px; color: #6B7280;">
        Need help? Reply to this email and we'll get back to you.
      </p>
    </div>`;
  const text =
    `Hi ${app.full_name},\n\n` +
    `You chose the ISO competence quiz for application ${app.application_number}.\n\n` +
    issued
      .map((i) => `${langName.get(i.targetLanguageId) ?? "(unknown)"}: ${i.tokenUrl}`)
      .join("\n") +
    `\n\nEach link expires in 240 hours. Reply if you need help.\n`;

  await sendMailgunEmail({
    to: { email: app.email, name: app.full_name },
    subject,
    html,
    text,
    respectDoNotContactFor: app.email,
    tags: ["v8-quiz-invitation", applicationId],
  });
}
