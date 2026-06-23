// ============================================================================
// cvp-get-quiz
//
// Applicant-facing. Validates a quiz token from cvp_quiz_submissions and
// returns the 40 assembled MCQ questions for the applicant to take —
// WITHOUT correct_option or explanation fields (those stay server-side).
//
// Companion to docs/qms/02-test-or-quiz-routing.md §5.
//
// POST /functions/v1/cvp-get-quiz
// Body: { token: string }
// Returns: { success, data: {
//   submissionId, token, targetLanguageName, applicantName,
//   expiresAt, remainingHours, remainingMinutes, status,
//   questions: [{ id, competence, difficulty, question, options }]
// }}
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hasCurrentNda, getActiveNdaTemplate, ndaGateEnabled } from "../_shared/nda-gate.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPETENCES = [
  { slug: "linguistic_textual_competence", scope: "target" },
  { slug: "cultural_competence", scope: "target" },
  { slug: "domain_competence", scope: "target" },
  { slug: "research_competence", scope: "cross-language" },
  { slug: "technical_competence", scope: "cross-language" },
] as const;

const QUESTIONS_PER_COMPETENCE = 8;

interface QuizSubmissionRow {
  id: string;
  application_id: string;
  target_language_id: string | null;
  token: string;
  token_expires_at: string;
  status: string;
  is_coa: boolean;
  is_cog_debrief: boolean;
}

interface QuizQuestionRow {
  id: string;
  competence_slug: string;
  question: string;
  options: { label: string; value: string }[];
  difficulty: string;
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

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }
  const token = (body.token ?? "").trim();
  if (!token) return jsonResponse({ success: false, error: "Token is required" }, 400);

  // 1. Resolve quiz submission by token
  const { data: subData, error: subErr } = await supabase
    .from("cvp_quiz_submissions")
    .select("id, application_id, target_language_id, token, token_expires_at, status, is_coa, is_cog_debrief")
    .eq("token", token)
    .maybeSingle();

  if (subErr || !subData) {
    return jsonResponse({ success: false, error: "Invalid quiz link." }, 404);
  }
  const sub = subData as QuizSubmissionRow;

  const now = new Date();
  // Already-submitted check
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
  // Expiry check (token_expires_at vs now)
  if (now > new Date(sub.token_expires_at)) {
    // Idempotent flip to expired
    if (sub.status !== "expired") {
      await supabase
        .from("cvp_quiz_submissions")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("id", sub.id);
    }
    return jsonResponse(
      {
        success: false,
        error: "token_expired",
        message: "This quiz link has expired.",
      },
      400,
    );
  }

  // 2. Fetch applicant metadata + target language name (no target language for
  // the cognitive-debriefing knowledge quiz — it is language-agnostic).
  const { data: appData } = await supabase
    .from("cvp_applications")
    .select("full_name, application_number, email")
    .eq("id", sub.application_id)
    .maybeSingle();

  // 2a. NDA-before-access gate. The applicant may be invited without an NDA, but
  // no quiz content is revealed until the confidentiality agreement is accepted
  // (clickwrap via cvp-applicant-sign-nda). Soft 200 so the page renders the NDA
  // step rather than treating it as an error.
  if (ndaGateEnabled()) {
    const appEmail = ((appData as Record<string, unknown> | null)?.email as string) ?? null;
    const ndaOk = await hasCurrentNda(supabase, sub.application_id, appEmail);
    if (!ndaOk) {
      const tmpl = await getActiveNdaTemplate(supabase);
      return jsonResponse({
        success: true,
        data: {
          nda_required: true,
          applicantName: ((appData as Record<string, unknown> | null)?.full_name as string) ?? "",
          applicantEmail: appEmail,
          nda: tmpl,
        },
      });
    }
  }
  let langData: Record<string, unknown> | null = null;
  if (sub.target_language_id) {
    const { data } = await supabase
      .from("languages")
      .select("name, code")
      .eq("id", sub.target_language_id)
      .maybeSingle();
    langData = data as Record<string, unknown> | null;
  }
  const targetLanguageCode =
    ((langData as Record<string, unknown> | null)?.code as string) ?? "";
  const applicantName =
    ((appData as Record<string, unknown> | null)?.full_name as string) ?? "";
  const applicationNumber =
    ((appData as Record<string, unknown> | null)?.application_number as string) ?? "";
  const targetLanguageName =
    ((langData as Record<string, unknown> | null)?.name as string) ?? "";

  // 3. Assemble 40 questions — 8 per competence. Target-scoped or
  // cross-language depending on competence. correct_option + explanation
  // are NEVER returned to the client.
  const questions: Array<{
    id: string;
    competence: string;
    difficulty: string;
    question: string;
    options: { label: string; value: string }[];
  }> = [];

  // Cognitive-debriefing: knowledge-only quiz drawn from the coa_methodology
  // bank (language-agnostic). No target-scoped competences, no translation
  // items — these consultants run COA interviews, they don't translate.
  if (sub.is_cog_debrief) {
    const { data: cdQ } = await supabase
      .from("iso_competence_quizzes")
      .select("id, competence_slug, question, options, difficulty")
      .eq("competence_slug", "coa_methodology")
      .eq("active", true)
      .is("target_language_id", null);
    const cdRows = ((cdQ ?? []) as QuizQuestionRow[])
      .sort(() => Math.random() - 0.5)
      .slice(0, 15);
    for (const r of cdRows) {
      questions.push({
        id: r.id,
        competence: r.competence_slug,
        difficulty: r.difficulty,
        question: r.question,
        options: r.options,
      });
    }
  }

  // Competence MCQs to load:
  //  - cognitive-debriefing: none (methodology-only knowledge quiz below).
  //  - COA: the cross-language (English) competences only. The COA quiz is
  //    English-language throughout; the applicant's TARGET-language and
  //    translation competence is tested by the Part-2 EN→target translation
  //    items, not by target-language MCQs. This also makes the COA quiz
  //    deliverable for every target (no per-target MCQ bank required).
  //  - standard quiz: all five competences (target-scoped + cross-language).
  const competencesToLoad = sub.is_cog_debrief
    ? []
    : sub.is_coa
      ? COMPETENCES.filter((c) => c.scope !== "target")
      : COMPETENCES;
  for (const c of competencesToLoad) {
    let q = supabase
      .from("iso_competence_quizzes")
      .select("id, competence_slug, question, options, difficulty")
      .eq("competence_slug", c.slug)
      .eq("active", true)
      .is("domain", null);
    if (c.scope === "target") {
      q = q.eq("target_language_id", sub.target_language_id);
    } else {
      q = q.is("target_language_id", null);
    }
    const { data, error } = await q;
    if (error) {
      console.error(`cvp-get-quiz: failed to load ${c.slug}: ${error.message}`);
      return jsonResponse(
        { success: false, error: "Failed to load quiz content. Please try again." },
        500,
      );
    }
    const rows = ((data ?? []) as QuizQuestionRow[])
      .sort(() => Math.random() - 0.5)
      .slice(0, QUESTIONS_PER_COMPETENCE);
    for (const r of rows) {
      questions.push({
        id: r.id,
        competence: r.competence_slug,
        difficulty: r.difficulty,
        question: r.question,
        options: r.options,
      });
    }
  }

  // COA track: append the COA methodology MCQ set (cross-language) and load the
  // Part-2 sentence-translation items (language-agnostic + this target language).
  let translationItems: Array<{
    id: string;
    source_text: string;
    construct: string;
    difficulty: string | null;
    flawed_draft: string | null;
    target_language_code: string | null;
  }> = [];
  if (sub.is_coa) {
    const { data: coaQ } = await supabase
      .from("iso_competence_quizzes")
      .select("id, competence_slug, question, options, difficulty")
      .eq("competence_slug", "coa_methodology")
      .eq("active", true)
      .is("target_language_id", null);
    const coaRows = ((coaQ ?? []) as QuizQuestionRow[])
      .sort(() => Math.random() - 0.5)
      .slice(0, QUESTIONS_PER_COMPETENCE);
    for (const r of coaRows) {
      questions.push({
        id: r.id,
        competence: r.competence_slug,
        difficulty: r.difficulty,
        question: r.question,
        options: r.options,
      });
    }

    const { data: tItems } = await supabase
      .from("cvp_coa_translation_items")
      .select("id, source_text, construct, difficulty, flawed_draft, target_language_code")
      .eq("active", true)
      .or(`target_language_code.is.null,target_language_code.eq.${targetLanguageCode}`)
      .order("order_index", { ascending: true });
    translationItems = (tItems ?? []) as typeof translationItems;
  }

  if (questions.length === 0) {
    return jsonResponse(
      { success: false, error: "No quiz content available for this target language." },
      404,
    );
  }

  // 4. Mark viewed if first view
  if (sub.status === "sent") {
    await supabase
      .from("cvp_quiz_submissions")
      .update({ status: "viewed", updated_at: now.toISOString() })
      .eq("id", sub.id);
  }

  const remainingMs = new Date(sub.token_expires_at).getTime() - now.getTime();
  const remainingHours = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
  const remainingMinutes = Math.max(
    0,
    Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
  );

  return jsonResponse({
    success: true,
    data: {
      submissionId: sub.id,
      token: sub.token,
      applicantName,
      applicationNumber,
      expiresAt: sub.token_expires_at,
      remainingHours,
      remainingMinutes,
      status: sub.status === "sent" ? "viewed" : sub.status,
      isCoa: sub.is_coa,
      isCogDebrief: sub.is_cog_debrief,
      targetLanguageName: sub.is_cog_debrief ? "Cognitive Debriefing (COA methodology)" : targetLanguageName,
      questions,
      translationItems,
    },
  });
});
