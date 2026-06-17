import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TestSubmissionRow {
  id: string;
  combination_id: string;
  test_id: string;
  application_id: string;
  submitted_file_path: string | null;
  submitted_notes: string | null;
  draft_content: string | null;
}

interface TestLibraryRow {
  id: string;
  title: string;
  source_language_id: string;
  target_language_id: string;
  domain: string;
  service_type: string;
  difficulty: string;
  source_text: string | null;
  reference_translation: string | null;
  lqa_source_translation: string | null;
  lqa_answer_key: Record<string, unknown>[] | null;
  mqm_dimensions_enabled: string[];
  ai_assessment_rubric: string | null;
}

interface LanguageRow {
  name: string;
}

interface TranslationAssessment {
  test_type: string;
  language_pair: string;
  domain: string;
  overall_score: number;
  pass: boolean;
  dimension_scores: {
    accuracy: number;
    fluency: number;
    terminology: number;
    formatting: number;
    certification_readiness?: number;
  };
  errors: {
    category: string;
    severity: string;
    location: string;
    note: string;
  }[];
  strengths: string[];
  feedback_draft: string;
  suggested_tier: string;
  confidence: string;
}

interface LqaAssessment {
  test_type: string;
  language_pair: string;
  domain: string;
  overall_score: number;
  pass: boolean;
  errors_identified_correctly: number;
  errors_missed: number;
  false_positives: number;
  category_accuracy: number;
  severity_accuracy: number;
  comment_quality: number;
  detailed_feedback: string;
  strengths: string[];
  weaknesses: string[];
  confidence: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find(
    (block: { type: string }) => block.type === "text"
  );
  if (!textBlock) {
    throw new Error("No text block in Claude response");
  }

  return textBlock.text;
}

function parseJsonResponse(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

// Domains that pull in certified-translation framing + certification_readiness
// dimension. Anything else (general, medical, technical, business, ...) is
// graded as general-purpose translation with 4 MQM dimensions only.
const CERTIFIED_DOMAINS = new Set(["certified", "legal"]);

function buildTranslationSystemPrompt(domain: string | null | undefined): string {
  const isCertified = CERTIFIED_DOMAINS.has((domain ?? "").toLowerCase());

  const intro = isCertified
    ? `You are an expert translation quality assessor for CETHOS, a Canadian certified translation company.

You evaluate certified translation test submissions against a reference translation and the source document. Return ONLY valid JSON — no preamble, no markdown.`
    : `You are an expert translation quality assessor.

You evaluate general-purpose translation test submissions against a reference translation and the source document. The test domain is "${domain ?? "general"}" — do NOT apply certified-translation, ATA, notarisation, or jurisdiction-specific standards. Return ONLY valid JSON — no preamble, no markdown.`;

  const weights = isCertified
    ? `- Accuracy (45%): Faithfulness to source, no omissions, no additions, correct meaning transfer
- Fluency (25%): Grammar, agreement, tense, syntax correctness (NOT stylistic preferences — see below)
- Terminology (20%): Domain-specific terms used correctly, consistency
- Certification-readiness (10%): Meets Canadian certified translation standards
- Formatting (informational, 0% weight): Reported for applicant awareness but does NOT affect overall_score`
    : `- Accuracy (50%): Faithfulness to source, no omissions, no additions, correct meaning transfer
- Fluency (30%): Grammar, agreement, tense, syntax correctness (NOT stylistic preferences — see below)
- Terminology (20%): Domain-specific terms used correctly, consistency
- Formatting (informational, 0% weight): Reported for applicant awareness but does NOT affect overall_score`;

  const dimensionScoresSchema = isCertified
    ? `  "dimension_scores": {
    "accuracy": number (0-100),
    "fluency": number (0-100),
    "terminology": number (0-100),
    "formatting": number (0-100),
    "certification_readiness": number (0-100)
  },`
    : `  "dimension_scores": {
    "accuracy": number (0-100),
    "fluency": number (0-100),
    "terminology": number (0-100),
    "formatting": number (0-100)
  },`;

  const errorCategories = isCertified
    ? `"accuracy" | "fluency" | "terminology" | "formatting" | "certification_readiness"`
    : `"accuracy" | "fluency" | "terminology" | "formatting"`;

  return `${intro}

Score on a 0-100 scale using MQM Core dimensions with these weights:
${weights}

Output JSON schema:
{
  "test_type": "translation" | "translation_review",
  "language_pair": string (e.g. "ES→EN"),
  "domain": string,
  "overall_score": number (0-100),
  "pass": boolean,
${dimensionScoresSchema}
  "errors": [
    {
      "category": ${errorCategories},
      "severity": "minor" | "major" | "critical",
      "location": string,
      "source_segment": string,
      "applicant_translation": string,
      "revised_translation": string,
      "comment": string
    }
  ],
  "strengths": string[],
  "feedback_draft": string,
  "suggested_tier": "standard" | "senior" | "expert",
  "confidence": "high" | "medium" | "low"
}

Per-error LQA edit log — MANDATORY structure:
- "source_segment": the relevant span from the SOURCE text, in the source language, verbatim.
- "applicant_translation": the relevant span from the APPLICANT's translation, in the target language, verbatim.
- "revised_translation": the corrected version of the applicant's span, in the target language. Wrap removed text in <del>…</del> and inserted text in <ins>…</ins> so the diff renders for the applicant. Example: "We <ins>are pleased</ins> to share <del>that we have</del> several updates".
- "comment": EXPLANATION IN ENGLISH ONLY. Why the original is wrong, what the rule is, why the revision is preferred. The applicant's reviewer reads this in English regardless of the language pair. Never write the comment in the target language.

Penalty exclusions — DO NOT count any of the following toward dimension or overall scores:
- Stylistic preferences: word-choice synonyms, register/tone shifts that don't change meaning, sentence-ordering preferences, optional connectives, voice choice (active vs passive) when both are grammatical, idiomatic phrasing alternatives.
- Surface polishing: extra/missing trailing spaces, optional Oxford commas, optional hyphenation, capitalization conventions that don't violate locale rules, optional punctuation choices.
- Formatting nits: layout cosmetics, number/date format variations that don't change the value, paragraph-break choices that don't affect comprehension.

You MAY still record stylistic/formatting observations in "errors" with severity = "minor" so the applicant sees them as feedback, but DO NOT lower the corresponding dimension score for these items. Reserve fluency penalties for actual grammar/agreement/tense/syntax errors that a native speaker would mark wrong. Reserve formatting penalties for layout failures that affect meaning or usability (missing paragraphs, garbled tables, broken numbering that changes values) — and even then, formatting only enters the feedback, not the overall_score (formatting weight is 0%).

When computing overall_score, use ONLY the weighted dimensions above. If formatting issues are the only weakness, overall_score should still be in the pass band.

Scoring guidelines:
- >= 75: Pass — strong translation quality
- 60-74: Borderline — send to staff review
- < 60: Fail — below minimum quality

Tier suggestion:
- standard: Acceptable quality with some errors
- senior: Good quality, strong domain knowledge
- expert: Excellent quality, publication-ready

Output budget — IMPORTANT for non-Latin scripts where each character costs more tokens:
- Cap "errors" at the 12 most consequential (severity-weighted: critical first, then major, then minor).
- Keep each "comment" (English) under ~150 characters. Be specific but terse.
- Keep "source_segment" / "applicant_translation" / "revised_translation" each under ~200 characters — quote only the relevant span, not whole paragraphs.
- Keep "feedback_draft" under 1500 characters. Plain prose, no bullets needed. Write in English.
- Keep "strengths" to 5 items max, each under 80 characters, in English.`;
}

const LQA_SYSTEM_PROMPT = `You are an expert LQA (Linguistic Quality Assurance) assessor for CETHOS, a Canadian certified translation company.

You evaluate LQA review test submissions. The applicant was given a flawed translation and asked to identify errors using MQM Core categories. You compare their findings against the answer key.

Return ONLY valid JSON — no preamble, no markdown.

MQM Core categories: Accuracy, Fluency, Terminology, Style, Locale Conventions, Design, Non-translation.
Severity levels: Minor, Major, Critical.

Evaluate:
- Whether errors were correctly identified (vs answer key)
- Whether the MQM category assignment is accurate
- Whether severity ratings (Minor/Major/Critical) are correctly applied
- Comment quality: actionable, professional, specific
- Whether the reviewer missed critical errors (heavy penalty)
- False positives (identified non-existent errors — moderate penalty)

Penalty exclusions — DO NOT penalize the applicant for any of the following:
- Errors in the answer key whose MQM category is "Style" or "Design" — if the applicant missed them, they do NOT count as errors_missed and do NOT lower category_accuracy or overall_score. Treat these as informational items only.
- Applicant findings categorized as "Style" or "Design" that are not in the answer key — do NOT count as false_positives. Note them in detailed_feedback if useful, but do NOT lower the score.
- Surface polishing observations (whitespace, capitalization that follows locale conventions, optional punctuation) — never count as missed errors or false positives.

Score the applicant only on their detection of Accuracy, Fluency (grammar/syntax), Terminology, Locale Conventions, and Non-translation errors. The applicant's awareness of Style/Design issues is a bonus that may be mentioned in strengths but never penalized.

Output JSON schema:
{
  "test_type": "lqa_review",
  "language_pair": string,
  "domain": string,
  "overall_score": number (0-100),
  "pass": boolean,
  "errors_identified_correctly": number,
  "errors_missed": number,
  "false_positives": number,
  "category_accuracy": number (0-100),
  "severity_accuracy": number (0-100),
  "comment_quality": number (0-100),
  "detailed_feedback": string,
  "strengths": string[],
  "weaknesses": string[],
  "confidence": "high" | "medium" | "low"
}

Scoring guidelines:
- >= 75: Pass — competent reviewer
- 60-74: Borderline — staff review needed
- < 60: Fail — insufficient review skills

Output budget — keep "detailed_feedback" under 1500 characters and "strengths"/"weaknesses" to 5 items each, each under 80 characters.`;

/**
 * cvp-assess-test
 *
 * AI-powered test assessment using Claude. Evaluates translation or LQA review submissions
 * against reference translations / answer keys using MQM Core dimensions.
 *
 * Triggered: automatically after test submission (fire-and-forget from cvp-submit-test).
 *
 * Payload: { submissionId: string, combinationId: string }
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { submissionId, combinationId } = await req.json();
    if (!submissionId || !combinationId) {
      return jsonResponse(
        { success: false, error: "submissionId and combinationId are required" },
        400
      );
    }

    // Fetch submission
    const { data: submission, error: subError } = await supabase
      .from("cvp_test_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (subError || !submission) {
      console.error("Error fetching submission:", subError);
      return jsonResponse(
        { success: false, error: "Submission not found" },
        404
      );
    }

    const sub = submission as unknown as TestSubmissionRow;

    // Fetch test from library (includes reference translation / answer key)
    const { data: test, error: testError } = await supabase
      .from("cvp_test_library")
      .select("*")
      .eq("id", sub.test_id)
      .single();

    if (testError || !test) {
      console.error("Error fetching test:", testError);
      return jsonResponse(
        { success: false, error: "Test not found" },
        404
      );
    }

    const testData = test as unknown as TestLibraryRow;

    // Fetch language names
    const { data: srcLang } = await supabase
      .from("languages")
      .select("name")
      .eq("id", testData.source_language_id)
      .single();
    const { data: tgtLang } = await supabase
      .from("languages")
      .select("name")
      .eq("id", testData.target_language_id)
      .single();

    const sourceLangName = (srcLang as unknown as LanguageRow | null)?.name ?? "Unknown";
    const targetLangName = (tgtLang as unknown as LanguageRow | null)?.name ?? "Unknown";
    const langPair = `${sourceLangName}→${targetLangName}`;

    // Get the applicant's submitted text
    const submittedText = sub.draft_content ?? "";

    let aiResult: Record<string, unknown>;
    let aiScore: number;

    try {
      if (testData.service_type === "lqa_review") {
        // LQA Review assessment
        const userMessage = `Assess this LQA review test submission.

Language pair: ${langPair}
Domain: ${testData.domain}

=== SOURCE TEXT ===
${testData.source_text ?? "Not provided"}

=== FLAWED TRANSLATION (given to applicant to review) ===
${testData.lqa_source_translation ?? "Not provided"}

=== ANSWER KEY (expected errors) ===
${JSON.stringify(testData.lqa_answer_key ?? [], null, 2)}

=== MQM DIMENSIONS ENABLED ===
${(testData.mqm_dimensions_enabled ?? []).join(", ")}

=== APPLICANT'S REVIEW SUBMISSION ===
${submittedText}

${testData.ai_assessment_rubric ? `=== ADDITIONAL RUBRIC ===\n${testData.ai_assessment_rubric}` : ""}

Evaluate the applicant's error identification, categorisation, severity ratings, and comment quality against the answer key.`;

        let rawResponse: string;
        try {
          rawResponse = await callClaude(LQA_SYSTEM_PROMPT, userMessage, 16384);
          aiResult = parseJsonResponse(rawResponse);
        } catch (firstErr) {
          console.error("First Claude call failed, retrying:", firstErr);
          try {
            rawResponse = await callClaude(LQA_SYSTEM_PROMPT, userMessage, 16384);
            aiResult = parseJsonResponse(rawResponse);
          } catch (retryErr) {
            console.error("Retry also failed:", retryErr);
            throw retryErr;
          }
        }

        const result = aiResult as unknown as LqaAssessment;
        aiScore = result.overall_score;
      } else {
        // Translation or Translation+Review assessment.
        // Prompt is built per-domain so general-domain tests aren't graded
        // against certified-translation standards.
        const translationSystemPrompt = buildTranslationSystemPrompt(testData.domain);
        const userMessage = `Assess this translation test submission.

Language pair: ${langPair}
Domain: ${testData.domain}
Test type: ${testData.service_type}
Difficulty: ${testData.difficulty}

=== SOURCE TEXT ===
${testData.source_text ?? "Not provided"}

=== REFERENCE TRANSLATION ===
${testData.reference_translation ?? "Not provided"}

=== APPLICANT'S TRANSLATION ===
${submittedText}

${testData.ai_assessment_rubric ? `=== ADDITIONAL RUBRIC ===\n${testData.ai_assessment_rubric}` : ""}

${sub.submitted_notes ? `=== APPLICANT'S NOTES ===\n${sub.submitted_notes}` : ""}

Evaluate the applicant's translation against the source text and reference translation. Score each MQM dimension and provide specific error annotations.`;

        let rawResponse: string;
        try {
          rawResponse = await callClaude(translationSystemPrompt, userMessage, 16384);
          aiResult = parseJsonResponse(rawResponse);
        } catch (firstErr) {
          console.error("First Claude call failed, retrying:", firstErr);
          try {
            rawResponse = await callClaude(translationSystemPrompt, userMessage, 16384);
            aiResult = parseJsonResponse(rawResponse);
          } catch (retryErr) {
            console.error("Retry also failed:", retryErr);
            throw retryErr;
          }
        }

        const result = aiResult as unknown as TranslationAssessment;
        aiScore = result.overall_score;
      }
      // Stamp grader provenance so staff can see which model produced the
      // result. Prompt version bumps when the rubric/output budget changes.
      (aiResult as Record<string, unknown>).model_used = "claude-sonnet-4-6";
      (aiResult as Record<string, unknown>).prompt_version = "2026-05-11-style-polish-excluded";
      (aiResult as Record<string, unknown>).assessed_at = new Date().toISOString();
    } catch (aiError) {
      // AI fallback — never block the pipeline
      console.error("AI test assessment failed, falling back to staff_review:", aiError);
      aiResult = {
        error: "ai_fallback",
        reason: aiError instanceof Error ? aiError.message : "Unknown AI error",
      };
      aiScore = 0;

      // Set status to staff review on the combination
      await supabase
        .from("cvp_test_combinations")
        .update({
          status: "assessed",
          ai_score: null,
          ai_assessment_result: aiResult,
          updated_at: new Date().toISOString(),
        })
        .eq("id", combinationId);

      // Update submission
      await supabase
        .from("cvp_test_submissions")
        .update({
          status: "assessed",
          ai_assessment_score: null,
          ai_assessment_result: aiResult,
          ai_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      // Set application to staff review
      await supabase
        .from("cvp_applications")
        .update({
          status: "staff_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.application_id);

      return jsonResponse({
        success: true,
        data: {
          submissionId,
          combinationId,
          status: "staff_review",
          aiError: true,
        },
      });
    }

    // Determine routing based on score. Thresholds relaxed 2026-05-15
    // (alongside shift to beginner-level source texts for the stranded-
    // applicant recovery batch). Previously 75/60; now 70/55:
    //   >= 70: auto-approved
    //   55-69: staff review (borderline)
    //   < 55:  auto-rejected
    let combinationStatus: string;
    if (aiScore >= 70) {
      combinationStatus = "approved";
    } else if (aiScore >= 55) {
      combinationStatus = "assessed"; // Staff review needed
    } else {
      combinationStatus = "rejected";
    }

    const now = new Date().toISOString();

    // Update submission with AI results
    await supabase
      .from("cvp_test_submissions")
      .update({
        status: "assessed",
        ai_assessment_score: aiScore,
        ai_assessment_result: aiResult,
        ai_assessed_at: now,
        updated_at: now,
      })
      .eq("id", submissionId);

    // Update combination with score and status
    const comboUpdate: Record<string, unknown> = {
      status: combinationStatus,
      ai_score: aiScore,
      ai_assessment_result: aiResult,
      updated_at: now,
    };
    if (combinationStatus === "approved") {
      comboUpdate.approved_at = now;
      // approved_by is null for auto-approval
    }
    await supabase
      .from("cvp_test_combinations")
      .update(comboUpdate)
      .eq("id", combinationId);

    // ---- Cascade auto-approval: certified_official follows General pass ----
    // Per April 2026 policy: certified translation isn't tested — direction +
    // formatting aren't yet in scope. When a translator's General test passes
    // (auto-approved at score >= 80), every certified_official combination on
    // the same application auto-approves alongside it. Staff doesn't have to
    // touch them. If the General comes back as "assessed" (staff review) or
    // "rejected", certified combos stay as-is and follow the manual flow.
    if (combinationStatus === "approved") {
      const { data: justAssessed } = await supabase
        .from("cvp_test_combinations")
        .select("domain, application_id")
        .eq("id", combinationId)
        .single();
      const justAssessedDomain =
        (justAssessed as { domain?: string } | null)?.domain ?? null;
      if (justAssessedDomain === "general") {
        const { data: certCombos } = await supabase
          .from("cvp_test_combinations")
          .select("id, status")
          .eq("application_id", sub.application_id)
          .eq("domain", "certified_official");
        const eligibleCerts = (certCombos ?? []).filter(
          (c) =>
            (c as { status: string }).status === "pending" ||
            (c as { status: string }).status === "skip_manual_review",
        );
        if (eligibleCerts.length > 0) {
          await supabase
            .from("cvp_test_combinations")
            .update({
              status: "approved",
              approved_at: now,
              updated_at: now,
            })
            .in(
              "id",
              eligibleCerts.map((c) => (c as { id: string }).id),
            );
          console.log(
            `Cascade: auto-approved ${eligibleCerts.length} certified_official combination(s) for application ${sub.application_id} after General test passed.`,
          );
        }
      }
    }

    // Update test library pass/fail stats (passing threshold matches the
    // auto-approve cutoff above)
    if (aiScore >= 70) {
      const { data: testRow } = await supabase
        .from("cvp_test_library")
        .select("total_pass_count")
        .eq("id", sub.test_id)
        .single();
      await supabase
        .from("cvp_test_library")
        .update({
          total_pass_count: ((testRow as Record<string, unknown> | null)?.total_pass_count as number ?? 0) + 1,
          updated_at: now,
        })
        .eq("id", sub.test_id);
    } else if (aiScore < 55) {
      const { data: testRow } = await supabase
        .from("cvp_test_library")
        .select("total_fail_count")
        .eq("id", sub.test_id)
        .single();
      await supabase
        .from("cvp_test_library")
        .update({
          total_fail_count: ((testRow as Record<string, unknown> | null)?.total_fail_count as number ?? 0) + 1,
          updated_at: now,
        })
        .eq("id", sub.test_id);
    }

    // Determine overall application status based on all combinations
    const { data: allCombos } = await supabase
      .from("cvp_test_combinations")
      .select("id, status, ai_score")
      .eq("application_id", sub.application_id);

    const combos = (allCombos ?? []) as { id: string; status: string; ai_score: number | null }[];
    const allAssessed = combos.every(
      (c) =>
        c.status === "approved" ||
        c.status === "rejected" ||
        c.status === "assessed" ||
        c.status === "skipped" ||
        c.status === "no_test_available"
    );

    if (allAssessed) {
      const hasApproved = combos.some((c) => c.status === "approved");
      const hasStaffReview = combos.some((c) => c.status === "assessed");
      const allRejected = combos
        .filter((c) => c.status !== "skipped" && c.status !== "no_test_available")
        .every((c) => c.status === "rejected");

      let appStatus: string;
      if (hasStaffReview) {
        appStatus = "staff_review";
      } else if (allRejected) {
        appStatus = "rejected";
      } else if (hasApproved) {
        appStatus = "test_assessed";
      } else {
        appStatus = "test_assessed";
      }

      const appUpdate: Record<string, unknown> = {
        status: appStatus,
        updated_at: now,
      };

      // Queue rejection email for full auto-reject
      if (appStatus === "rejected") {
        appUpdate.rejection_reason = `All test combinations scored below threshold. Highest score: ${Math.max(...combos.map((c) => c.ai_score ?? 0))}`;
        appUpdate.rejection_email_status = "queued";
        appUpdate.rejection_email_queued_at = now;
        appUpdate.can_reapply_after = new Date(
          Date.now() + 180 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0]; // 6 months
      }

      await supabase
        .from("cvp_applications")
        .update(appUpdate)
        .eq("id", sub.application_id);
    }

    // Schedule V22 feedback-request for 24h from now. The cron job
    // cvp-process-feedback-auto-send picks up due rows and fires the email.
    // Admins can short-circuit via "Send V22 now" in the recruitment UI.
    // Skips silently if there are no errors to review or a round already
    // exists (idempotent — re-grading doesn't double-schedule).
    try {
      const errorsForRound = Array.isArray(
        (aiResult as { errors?: unknown }).errors,
      )
        ? ((aiResult as { errors: unknown[] }).errors as unknown[])
        : [];

      if (errorsForRound.length > 0) {
        const { data: existingRound } = await supabase
          .from("cvp_test_feedback_rounds")
          .select("submission_id, status, auto_sent_at, staff_skip")
          .eq("submission_id", submissionId)
          .maybeSingle();

        if (!existingRound) {
          // Generate a token now so the smoke admin tools and the cron both
          // have a stable URL to reference. cvp-send-test-feedback-request
          // will reuse this token when forceResend is false.
          const tokenBytes = new Uint8Array(32);
          crypto.getRandomValues(tokenBytes);
          const token = Array.from(tokenBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const autoSendAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();
          const expiresAt = new Date(
            Date.now() + (24 + 4 * 24) * 60 * 60 * 1000,
          ).toISOString(); // 24h delay + 4-day review window

          const { error: insertErr } = await supabase
            .from("cvp_test_feedback_rounds")
            .insert({
              submission_id: submissionId,
              combination_id: combinationId,
              token,
              status: "pending",
              auto_send_at: autoSendAt,
              expires_at: expiresAt,
            });
          if (insertErr) {
            console.error(
              "Failed to schedule V22 feedback round:",
              insertErr,
            );
          }
        }
      }
    } catch (e) {
      console.error("Schedule V22 feedback round failed:", e);
    }

    return jsonResponse({
      success: true,
      data: {
        submissionId,
        combinationId,
        score: aiScore,
        status: combinationStatus,
        pass: aiScore >= 70,
      },
    });
  } catch (err) {
    console.error("Unhandled error in cvp-assess-test:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred." },
      500
    );
  }
});
