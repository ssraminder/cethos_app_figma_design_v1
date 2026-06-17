/**
 * cvp-harvest-translation
 *
 * Phase 2 of the test-library bootstrap. Takes a quality applicant translation
 * (an EN→Target submission scored above threshold) and turns it into a new
 * library row in the REVERSE direction (Target→EN), where:
 *   - source_text          = the applicant's translated text (target language)
 *   - reference_translation = the original English test source
 *   - source_language_id   = original test's target language
 *   - target_language_id   = English
 *   - is_active = false    → staff must polish + flip on
 *
 * This unlocks Target→EN tests at zero AI cost: human translations become the
 * test source material, and the canonical English already exists in the library.
 *
 * Usage:
 *   POST /cvp-harvest-translation
 *   Body: { submissionId: string, staffId?: string }
 *
 * Response (success):
 *   { success: true, data: { libraryRowId, title } }
 *
 * Response (skipped):
 *   { success: false, reason: "..." }
 *
 * Skip reasons:
 *   - submission_not_found
 *   - not_assessed             — no AI score yet
 *   - score_too_low            — AI score below MIN_SCORE (80)
 *   - no_translation_text      — submitted as file only, no draft_content;
 *                                staff must extract text manually
 *   - source_test_missing      — original test row deleted
 *   - source_lang_not_english  — current scope is EN→Target only
 *   - duplicate                — a harvested row from this submission already
 *                                exists (idempotent)
 *
 * Staff review flow:
 *   1. Library row lands is_active=false with title prefix [HARVESTED].
 *   2. Staff reviews source_text quality, polishes typos / awkward phrasing.
 *   3. Staff sets is_active=true → row enters rotation for Target→EN tests.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// AI assessment scores are 0–100 in this project. 80 is the rule-of-thumb
// passing threshold; raise via env if calibration shifts.
const MIN_SCORE = Number(Deno.env.get("CVP_HARVEST_MIN_SCORE") ?? "80");
const ENGLISH_LANG_ID = "fde091d2-db5f-4e41-a490-7e15efc419e1";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SubmissionRow {
  id: string;
  test_id: string;
  combination_id: string;
  application_id: string;
  status: string;
  draft_content: string | null;
  submitted_file_path: string | null;
  ai_assessment_score: number | null;
}

interface TestRow {
  id: string;
  domain: string;
  difficulty: string;
  source_language_id: string;
  target_language_id: string | null;
  source_text: string | null;
  service_type: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "method_not_allowed" }, 405);
  }

  let body: { submissionId?: string; staffId?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.submissionId) {
    return json({ success: false, error: "submissionId required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // 1. Load submission
  const { data: subRow, error: subErr } = await supabase
    .from("cvp_test_submissions")
    .select(
      "id, test_id, combination_id, application_id, status, draft_content, submitted_file_path, ai_assessment_score",
    )
    .eq("id", body.submissionId)
    .single();

  if (subErr || !subRow) {
    return json({ success: false, reason: "submission_not_found" }, 404);
  }
  const sub = subRow as unknown as SubmissionRow;

  // 2. Quality gate — only harvest assessed, passing translations
  if (sub.ai_assessment_score === null) {
    return json({ success: false, reason: "not_assessed" });
  }
  if (sub.ai_assessment_score < MIN_SCORE) {
    return json({
      success: false,
      reason: "score_too_low",
      score: sub.ai_assessment_score,
      minScore: MIN_SCORE,
    });
  }

  // 3. Need actual text. submitted_file_path = uploaded .docx/.pdf — out of
  // scope for v1; staff would have to extract text manually and re-trigger
  // with that content. draft_content is the inline plain-text fallback.
  const translationText = sub.draft_content?.trim();
  if (!translationText || translationText.length < 50) {
    return json({
      success: false,
      reason: "no_translation_text",
      hint: sub.submitted_file_path
        ? "submission has a file upload but no draft_content; extract text from the file and call this function with a body override (TODO)"
        : "submission has neither draft_content nor file",
    });
  }

  // 4. Load original test
  const { data: testRow, error: testErr } = await supabase
    .from("cvp_test_library")
    .select(
      "id, domain, difficulty, source_language_id, target_language_id, source_text, service_type",
    )
    .eq("id", sub.test_id)
    .single();

  if (testErr || !testRow) {
    return json({ success: false, reason: "source_test_missing" }, 404);
  }
  const test = testRow as unknown as TestRow;

  // 5. Scope check — only handle EN→Target sources for now. Other directions
  // need their own design (e.g., harvesting an FR→EN submission to make a
  // Target→FR test).
  if (test.source_language_id !== ENGLISH_LANG_ID) {
    return json({ success: false, reason: "source_lang_not_english" });
  }

  // Wildcard sources (target_language_id IS NULL) need the actual target
  // language from the combination, not the test row.
  let originalTargetLangId = test.target_language_id;
  if (!originalTargetLangId) {
    const { data: combo } = await supabase
      .from("cvp_test_combinations")
      .select("target_language_id")
      .eq("id", sub.combination_id)
      .single();
    if (combo) {
      originalTargetLangId =
        (combo as unknown as { target_language_id: string }).target_language_id;
    }
  }
  if (!originalTargetLangId) {
    return json({ success: false, reason: "could_not_resolve_target_lang" });
  }

  // 6. Idempotency — don't double-harvest the same submission
  const harvestTitlePrefix = `[HARVESTED] from-submission:${sub.id}`;
  const { data: existing } = await supabase
    .from("cvp_test_library")
    .select("id")
    .like("title", `${harvestTitlePrefix}%`)
    .limit(1);
  if (existing && existing.length > 0) {
    return json({
      success: false,
      reason: "duplicate",
      existingLibraryRowId: (existing[0] as { id: string }).id,
    });
  }

  // 7. Insert the reverse-direction library row.
  // source = applicant's translation (target language)
  // target = English
  // reference_translation = original English test source (zero AI cost!)
  const newTitle =
    `${harvestTitlePrefix} ${test.domain} ${test.difficulty}`;

  const { data: inserted, error: insertErr } = await supabase
    .from("cvp_test_library")
    .insert({
      title: newTitle,
      source_language_id: originalTargetLangId,
      target_language_id: ENGLISH_LANG_ID,
      domain: test.domain,
      service_type: test.service_type ?? "domain_test",
      difficulty: test.difficulty,
      source_text: translationText,
      instructions:
        "Translate this passage into English. Source is a real translation harvested from a CETHOS qualification test — staff has reviewed quality.",
      reference_translation: test.source_text,
      is_active: false, // staff must polish + activate
      times_used: 0,
    })
    .select("id, title")
    .single();

  if (insertErr || !inserted) {
    return json(
      { success: false, error: insertErr?.message ?? "insert failed" },
      500,
    );
  }

  return json({
    success: true,
    data: {
      libraryRowId: (inserted as { id: string }).id,
      title: (inserted as { title: string }).title,
      sourceSubmissionId: sub.id,
      targetLangId: originalTargetLangId,
      domain: test.domain,
      difficulty: test.difficulty,
      score: sub.ai_assessment_score,
      activatedAutomatically: false,
      note: "Library row created with is_active=false. Staff must review source_text quality, polish typos / awkward phrasing, then flip is_active=true.",
    },
  });
});
