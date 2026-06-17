// ============================================================================
// cvp-preview-quiz
//
// Staff-only smoke-test helper: renders an ISO 17100 §6.1.2 competence quiz
// exactly as `cvp-send-tests` will assemble it for an applicant (40 questions:
// 8 per competence, target-language-scoped for ling/cultural/domain, cross-
// language baseline for research/technical) and emails the rendered HTML to
// the staff recipient for content review.
//
// Used during the test-or-quiz routing rollout to validate per-language
// quiz content before pointing real applicants at it.
//
// POST /functions/v1/cvp-preview-quiz
// Body: { targetLanguageId: uuid, recipientEmail: string, languageLabel?: string }
// Returns: { success, data: { sent, totalQuestions, breakdown } }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunOperationalEmail } from "../_shared/mailgun.ts";
import { requireStaff } from "../_shared/require-staff.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPETENCES = [
  { slug: "linguistic_textual_competence", label: "Linguistic & Textual Competence", scope: "target" },
  { slug: "cultural_competence", label: "Cultural Competence", scope: "target" },
  { slug: "domain_competence", label: "Domain Competence", scope: "target" },
  { slug: "research_competence", label: "Research Competence", scope: "cross-language" },
  { slug: "technical_competence", label: "Technical Competence", scope: "cross-language" },
] as const;

const QUESTIONS_PER_COMPETENCE = 8;

interface QuizRow {
  id: string;
  competence_slug: string;
  question: string;
  options: { label: string; value: string }[];
  correct_option: string;
  explanation: string;
  difficulty: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  // Staff-only — the preview email contains correct answers + explanations.
  // Callers must invoke via supabase.functions.invoke() from a signed-in
  // admin session so the Supabase auth JWT travels in Authorization.
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return jsonResponse({ success: false, error: auth.error }, auth.status);
  }

  let body: {
    targetLanguageId?: string;
    recipientEmail?: string;
    languageLabel?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const targetLanguageId = (body.targetLanguageId ?? "").trim();
  const recipientEmail = (body.recipientEmail ?? "").trim();
  const languageLabel = (body.languageLabel ?? "the target language").trim();
  if (!targetLanguageId || !recipientEmail) {
    return jsonResponse(
      { success: false, error: "targetLanguageId_and_recipientEmail_required" },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull 8 random active questions per competence — target-scoped or
  // cross-language depending on the competence (matches cvp-send-tests
  // assembly logic per docs/qms/02-test-or-quiz-routing.md §3).
  const blocks: { label: string; rows: QuizRow[] }[] = [];
  const breakdown: Record<string, number> = {};

  for (const c of COMPETENCES) {
    let q = supabase
      .from("iso_competence_quizzes")
      .select("id, competence_slug, question, options, correct_option, explanation, difficulty")
      .eq("competence_slug", c.slug)
      .eq("active", true)
      .is("domain", null);
    if (c.scope === "target") {
      q = q.eq("target_language_id", targetLanguageId);
    } else {
      q = q.is("target_language_id", null);
    }
    const { data, error } = await q;
    if (error) {
      return jsonResponse(
        { success: false, error: `query_failed: ${error.message}` },
        500,
      );
    }
    const rows = ((data ?? []) as QuizRow[])
      .sort(() => Math.random() - 0.5)
      .slice(0, QUESTIONS_PER_COMPETENCE);
    blocks.push({ label: c.label, rows });
    breakdown[c.slug] = rows.length;
  }

  const totalQuestions = blocks.reduce((s, b) => s + b.rows.length, 0);
  if (totalQuestions === 0) {
    return jsonResponse(
      { success: false, error: "no_questions_found_for_target_language" },
      404,
    );
  }

  // Render HTML — applicant-style (questions + options visible) plus a
  // separate "answer key" section at the bottom for staff review.
  const renderQuestion = (r: QuizRow, num: number): string => `
    <div style="margin: 18px 0; padding: 14px 16px; background: #F9FAFB; border-left: 3px solid #0891B2; border-radius: 4px;">
      <div style="font-size: 12px; color: #6B7280; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
        Question ${num} &middot; ${esc(r.difficulty)}
      </div>
      <div style="font-size: 14px; color: #111827; margin-bottom: 10px; line-height: 1.5;">
        ${esc(r.question)}
      </div>
      <ol style="margin: 0; padding-left: 22px; font-size: 14px; color: #374151; line-height: 1.7;" type="A">
        ${r.options.map((o) => `<li>${esc(o.label)}</li>`).join("")}
      </ol>
    </div>`;

  const renderAnswer = (r: QuizRow, num: number): string => `
    <div style="margin: 10px 0; padding: 10px 14px; background: #FEFCE8; border-left: 3px solid #CA8A04; border-radius: 4px; font-size: 13px;">
      <strong>Q${num}:</strong> Correct = <strong>${esc(r.correct_option.toUpperCase())}</strong>
      ${r.explanation ? `<div style="color: #6B7280; margin-top: 4px;">${esc(r.explanation)}</div>` : ""}
    </div>`;

  let questionNum = 1;
  let questionsHtml = "";
  let answersHtml = "";
  for (const block of blocks) {
    questionsHtml += `<h2 style="font-size: 16px; color: #0C2340; margin-top: 28px; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px;">${esc(block.label)}</h2>`;
    answersHtml += `<h3 style="font-size: 14px; color: #0C2340; margin-top: 18px;">${esc(block.label)}</h3>`;
    for (const r of block.rows) {
      questionsHtml += renderQuestion(r, questionNum);
      answersHtml += renderAnswer(r, questionNum);
      questionNum++;
    }
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 0 auto; color: #111827;">
      <div style="padding: 20px 24px; background: #0C2340; color: #fff; border-radius: 8px 8px 0 0;">
        <div style="font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.1em;">CETHOS &middot; ISO 17100 §6.1.2 quiz preview</div>
        <div style="font-size: 20px; font-weight: 600; margin-top: 6px;">Competence quiz preview — ${esc(languageLabel)}</div>
      </div>
      <div style="padding: 16px 24px; background: #F9FAFB; border: 1px solid #E5E7EB; border-top: none;">
        <p style="font-size: 13px; color: #374151; margin: 0;">
          ${totalQuestions} questions assembled as they will be served to an applicant once the quiz routing ships. Answer key + explanations follow the questions for staff review.
        </p>
        <p style="font-size: 12px; color: #6B7280; margin: 8px 0 0;">
          Breakdown: ${Object.entries(breakdown).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" &middot; ")}
        </p>
      </div>
      <div style="padding: 8px 24px 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
        ${questionsHtml}
        <hr style="margin: 36px 0 24px; border: none; border-top: 1px dashed #D1D5DB;" />
        <h2 style="font-size: 16px; color: #CA8A04; margin: 0 0 10px;">Answer key (staff review only — not shown to applicants)</h2>
        ${answersHtml}
      </div>
    </div>`;

  const text = `Competence quiz preview — ${languageLabel}\n\n${totalQuestions} questions. See HTML version for full layout.\n`;

  const result = await sendMailgunOperationalEmail({
    to: { email: recipientEmail, name: "CETHOS staff review" },
    subject: `[CETHOS] Quiz preview — ${languageLabel} (${totalQuestions} questions)`,
    html,
    text,
    tags: ["quiz-preview", "iso-17100"],
  });

  return jsonResponse({
    success: true,
    data: {
      sent: result.sent,
      mailgunId: result.mailgunId ?? null,
      reason: result.reason ?? null,
      totalQuestions,
      breakdown,
    },
  });
});
