/**
 * cvp-prescreen-application — v2 (CV-aware)
 *
 * Reads the applicant's CV from cvp-applicant-cvs storage bucket, sends it to
 * Claude as a PDF document block alongside the form data, and uses both signals
 * to score the application. Falls back to form-only scoring on any CV read
 * failure (path missing, file missing, >32MB, non-PDF, download error).
 *
 * Prompt version: v2-cv-aware
 * Model: claude-sonnet-4-5 (vision-capable; required for PDF document input)
 *
 * Trigger: synchronous fire-and-forget from cvp-submit-application after insert.
 * Also re-invokable via cvp-reprocess-prescreens for back-fills.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import {
  buildV2PrescreenPassed,
  buildV8UnderManualReview,
} from "../_shared/email-templates.ts";
import { buildPrescreenGuidance } from "../_shared/prescreen-guidance.ts";
import { getSafeModeStatus } from "../_shared/safe-mode.ts";
import { MODEL_BASELINE, MODEL_QUALITY } from "../_shared/ai-models.ts";
import { shouldAutoSendTest } from "../_shared/red-flag-weights.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Model selected dynamically per request: reassessment uses the Opus-tier
// MODEL_QUALITY; routine prescreens use the Sonnet-tier MODEL_BASELINE.
// v3-assets-aware: split positive/negative signals into assets[] vs red_flags[];
// explicit never-flag list (Canadian experience, lack of certs, country of
// residence, early-career, volunteer work, side-work in related fields).
// Whether staff-guidance from verdicts is prepended is reflected in
// ai_prescreening_result.staff_guidance_count (not the version string).
const PROMPT_VERSION_BASE = "v4-cv-mismatch-tightened";
const PROMPT_VERSION_GUIDED = "v4-cv-mismatch-tightened-staff-guided";
const MAX_PDF_BYTES = 32 * 1024 * 1024; // Anthropic document input limit

interface PrescreenResult {
  overall_score: number;
  recommendation: "proceed" | "staff_review" | "reject";
  demand_match: "high" | "medium" | "low";
  certification_quality: "high" | "medium" | "low" | "none";
  experience_consistency: "high" | "medium" | "low";
  sample_quality: "high" | "medium" | "low" | "not_provided";
  rate_expectation_assessment: "within_band" | "above_band" | "below_band" | "not_provided";
  red_flags: string[];
  assets: string[];   // v3+: positive signals (notable employers, Canadian experience, etc.)
  notes: string;
  suggested_test_difficulty: "beginner" | "intermediate" | "advanced";
  suggested_test_types: string[];
  suggested_tier: "standard" | "senior" | "expert";
  cv_quality?: "high" | "medium" | "low" | "not_readable";
  cv_corroborates_form?: "fully" | "partially" | "contradicts" | "not_readable";
  cv_unique_signals?: string[];
}

interface CogPrescreenResult {
  overall_score: number;
  recommendation: "staff_review";
  coa_instrument_experience: "strong" | "partial" | "weak";
  guideline_familiarity: "strong" | "partial" | "weak";
  interviewing_skills: "strong" | "partial" | "weak";
  language_fluency: "strong" | "partial" | "weak";
  report_writing_experience: "strong" | "partial" | "weak";
  red_flags: string[];
  assets: string[];   // v3+: positive signals
  notes: string;
  cv_quality?: "high" | "medium" | "low" | "not_readable";
  cv_corroborates_form?: "fully" | "partially" | "contradicts" | "not_readable";
  cv_unique_signals?: string[];
}

interface ApplicationRow {
  id: string;
  role_type: "translator" | "cognitive_debriefing";
  full_name: string;
  email: string;
  country: string;
  years_experience: number | null;
  education_level: string | null;
  certifications: { name: string; customName?: string; expiryDate?: string }[];
  cat_tools: string[];
  services_offered: string[];
  rate_expectation: number | null;
  notes: string | null;
  cog_years_experience: number | null;
  cog_degree_field: string | null;
  cog_credentials: string | null;
  cog_instrument_types: string[];
  cog_therapy_areas: string[];
  cog_pharma_clients: string | null;
  cog_ispor_familiarity: string | null;
  cog_fda_familiarity: string | null;
  cog_prior_debrief_reports: boolean;
  cv_storage_path: string | null;
}

interface TestCombination {
  id: string;
  source_language: { name: string };
  target_language: { name: string };
  domain: string;
  service_type: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Prompt: Translator ----------

const TRANSLATOR_SYSTEM_PROMPT = `You are an expert recruitment screener for CETHOS, a certified-translation company that hires freelance translators GLOBALLY (not just in Canada).

You evaluate freelance translator applications. Return ONLY valid JSON matching the schema below — no preamble, no markdown, no commentary outside the JSON object.

INPUTS YOU MAY RECEIVE
1. A structured form-data text block with the applicant's self-reported claims (always present).
2. A PDF attachment of the applicant's CV/resume (often present, sometimes absent).

WHEN A CV IS ATTACHED, IT IS A PRIMARY SIGNAL — NOT AN OPTIONAL EXTRA.
Read it carefully and weigh it heavily:
- Cross-check claimed years of experience against employment dates in the CV. A claim of "10 years" backed by a CV showing only 3 years of jobs is a strong negative.
- Cross-check claimed certifications. CV lists ATA / CTTIC / ISO 17100 / CIOL etc? That corroborates. Form claims certs the CV doesn't mention? Flag it.
- Past employers (translation agencies, enterprises, government, hospitals) validate domain claims.
- Past projects, clients, or publications confirm language-pair expertise.
- CV-internal red flags: employment gaps, typos, generic/template content, mismatched language quality (a translator whose own CV English is poor).
- CV unique signals — notable past employers, publications, niche specialisms, non-listed certifications.

=====================================================================
ABSOLUTE RULES — NEVER FLAG THESE AS RED FLAGS (staff policy)
=====================================================================
CETHOS hires globally. The following are NOT negatives and MUST NOT appear
in red_flags. When PRESENT they belong in assets, not red_flags.

1. Lack of Canadian-market experience, Canadian clients, Canadian residency,
   or Canadian certifications (CTTIC, ATIO, STIBC, OTTIAQ) is NOT a red flag.
   Canadian credentials are an ASSET when present, never a concern when absent.
2. Lack of ATA / ISO-17100 / CIOL / any formal translation certification is
   NOT a red flag by itself. Cost of certification is prohibitive in many
   countries; we hire based on demonstrable skill, not credentials.
3. Applicant's country of residence is NOT a red flag. We pay globally.
4. Translator also teaches a language / does OPI interpreting / works in
   related fields is NOT a red flag — it demonstrates language proficiency.
5. Volunteer / unpaid translation work (Audiopedia, TED, community projects)
   is legitimate exposure, NOT a red flag.
6. Being early-career / young / recent graduate is NOT a red flag — routes
   to "standard" tier; let them be tested.
7. Past work on software / telecom / marketing / commercial localisation
   is NOT a red flag just because CETHOS also does certified translation.
   It's domain breadth; note it in assets.
8. Specific language-pair demand being "low" or "extremely low" in any
   particular market is NOT a red flag against the applicant — it's a
   market observation, captured in the demand_match field, not red_flags.

DO flag these (real concerns):
- Claimed years contradicted by CV employment dates (inflation of seniority)
- Form certifications that the CV doesn't back up
- CV quality so poor (typos, incoherent language) that the applicant
  cannot deliver publication-grade work
- Obvious AI-generated / template CV with no substance
- Evidence of academic dishonesty, plagiarism, or fraudulent claims

=====================================================================
ASSETS vs RED FLAGS
=====================================================================
ASSETS are positive signals — strengths worth highlighting to staff. Emit
them in the \`assets\` array. Examples:
- "20 years of commercial / technical translation experience"
- "Master's in Translation Studies from KU Leuven"
- "CTTIC-certified (Canada-recognised)"
- "Published literary translator — notable volume of work"
- "Worked at SDL 2015-2019 on life-sciences accounts"
- "Demonstrated CAT-tool fluency across Trados, MemoQ, Phrase"
- "CV language quality is publication-grade"

The DEFAULT stance should be generous on assets. If an applicant has ANY
relevant experience, certifications, or evidence of quality, surface them.

SCORING GUIDELINES (0–100)
- Weight CV evidence HEAVILY when it corroborates strong form claims.
- PENALIZE HEAVILY only when the CV DIRECTLY contradicts the form (e.g.
  applicant claims sworn-translator status but CV shows none, claims a
  certification the CV omits and that would be impossible to omit, claims
  a different professional identity altogether).
- Minor numerical drift (e.g. form says 8 years, CV implies 6–7) is NOT a
  direct contradiction. Set cv_corroborates_form="partially" and DO NOT add
  it as a red_flag. Most applicants round up modestly; this is normal.
- Reserve cv_corroborates_form="contradicts" for genuine identity-level or
  credential-level contradictions, not numeric drift.
- Score reflects likely FIT to the role, not how many boxes are ticked.
- 70+ = strong candidate, proceed to testing
- 50–69 = uncertain, flag for staff review
- <50 = weak candidate, recommend rejection (staff still approves)

OUTPUT JSON SCHEMA (return EXACTLY these keys; no extras)
{
  "overall_score": number (0–100),
  "recommendation": "proceed" | "staff_review" | "reject",
  "demand_match": "high" | "medium" | "low",
  "certification_quality": "high" | "medium" | "low" | "none",
  "experience_consistency": "high" | "medium" | "low",
  "sample_quality": "high" | "medium" | "low" | "not_provided",
  "rate_expectation_assessment": "within_band" | "above_band" | "below_band" | "not_provided",
  "red_flags": string[],
  "assets": string[],
  "notes": string,
  "suggested_test_difficulty": "beginner" | "intermediate" | "advanced",
  "suggested_test_types": string[],
  "suggested_tier": "standard" | "senior" | "expert",
  "cv_quality": "high" | "medium" | "low" | "not_readable",
  "cv_corroborates_form": "fully" | "partially" | "contradicts" | "not_readable",
  "cv_unique_signals": string[]
}

FIELD NOTES
- "sample_quality" reflects CV quality itself (formatting, language, clarity).
  If no CV attached, use "not_provided".
- "cv_quality": overall professionalism of the CV document.
- "cv_corroborates_form": "fully" | "partially" | "contradicts" | "not_readable".
- "cv_unique_signals": short factual items visible only in CV (past employers,
  projects, memberships not mentioned in the form).
- "assets": ALL positive signals — from form OR CV — including Canadian
  credentials when present. This is the field staff reads first.

TIER ASSIGNMENT RULES
- standard: <3 years experience, basic or no certs
- senior: 3–7 years, ATA/CTTIC or equivalent
- expert: 7+ years, multiple recognised certs, specialist domains`;

// ---------- Prompt: Cognitive Debriefing ----------

const COG_DEBRIEF_SYSTEM_PROMPT = `You are an expert recruitment screener for CETHOS, evaluating cognitive debriefing consultant applications. CETHOS hires globally.

Cognitive debriefing consultants conduct qualitative interviews with patients/participants to assess whether translated clinical outcome assessments (COAs/PROs) are understood as intended.

Return ONLY valid JSON — no preamble, no markdown.

INPUTS
1. A structured form-data text block (always present).
2. A PDF attachment of the applicant's CV (often present).

When the CV is attached, weigh it heavily:
- Cross-check claimed years of debriefing/qualitative-research experience against the CV.
- Look for past work on COA/PRO instruments, ePRO platforms, or patient interview studies.
- Note ISPOR, FDA COA, EMA guideline familiarity if visible.
- Look for sponsor/CRO clients (validate the form's "pharma clients" claim).
- Note language fluency signals.
- CV-internal concerns: gaps, generic templates, language quality issues.

=====================================================================
ABSOLUTE RULES — NEVER FLAG THESE (staff policy)
=====================================================================
CETHOS hires globally. NOT red flags:
1. Lack of Canadian-market experience or Canadian credentials.
2. Lack of formal translation certifications (cost-prohibitive in many
   countries; we hire on demonstrable skill).
3. Country of residence / working abroad.
4. Consultant also does related work (research assistance, teaching,
   interpretation) — demonstrates breadth.
5. Early-career or recent graduate.

Assets worth highlighting: Canadian credentials when present, past sponsor
work, ISPOR/FDA training, publications in clinical-outcomes literature,
multilingual CVs.

EVALUATE BASED ON THESE WEIGHTED CRITERIA
- COA/PRO instrument experience (30%)
- ISPOR/FDA COA guideline familiarity (20%)
- Interviewing/qualitative research skills (20%)
- Native/near-native target language fluency (20%)
- Prior debrief report writing experience (10%)

OUTPUT JSON SCHEMA (return EXACTLY these keys)
{
  "overall_score": number (0–100),
  "recommendation": "staff_review",
  "coa_instrument_experience": "strong" | "partial" | "weak",
  "guideline_familiarity": "strong" | "partial" | "weak",
  "interviewing_skills": "strong" | "partial" | "weak",
  "language_fluency": "strong" | "partial" | "weak",
  "report_writing_experience": "strong" | "partial" | "weak",
  "red_flags": string[],
  "assets": string[],
  "notes": string,
  "cv_quality": "high" | "medium" | "low" | "not_readable",
  "cv_corroborates_form": "fully" | "partially" | "contradicts" | "not_readable",
  "cv_unique_signals": string[]
}

IMPORTANT: recommendation MUST always be "staff_review" for cognitive debriefing — AI is advisory only, staff always makes the final decision.`;

// ---------- CV download ----------

interface CvFetchResult {
  base64: string | null;
  mediaType: string;
  read: boolean;
  error: string | null;
}

async function fetchCv(
  supabase: SupabaseClient,
  cvPath: string | null,
): Promise<CvFetchResult> {
  if (!cvPath) {
    return { base64: null, mediaType: "", read: false, error: "no_cv_path" };
  }
  if (!cvPath.toLowerCase().endsWith(".pdf")) {
    return {
      base64: null,
      mediaType: "",
      read: false,
      error: `non_pdf_format (${cvPath.split(".").pop() ?? "unknown"})`,
    };
  }
  try {
    const { data, error } = await supabase.storage
      .from("cvp-applicant-cvs")
      .download(cvPath);
    if (error || !data) {
      return {
        base64: null,
        mediaType: "",
        read: false,
        error: `download_failed: ${error?.message ?? "unknown"}`,
      };
    }
    const buf = await data.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) {
      return {
        base64: null,
        mediaType: "",
        read: false,
        error: `cv_too_large (${buf.byteLength} bytes, max ${MAX_PDF_BYTES})`,
      };
    }
    // Base64 in chunks to avoid stack overflow on large arrays
    const bytes = new Uint8Array(buf);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + CHUNK)),
      );
    }
    return {
      base64: btoa(binary),
      mediaType: "application/pdf",
      read: true,
      error: null,
    };
  } catch (err) {
    return {
      base64: null,
      mediaType: "",
      read: false,
      error: `exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------- Claude call ----------

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  cv: CvFetchResult,
  maxTokens: number,
  model: string,
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const content: unknown[] = [];
  if (cv.read && cv.base64) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: cv.mediaType,
        data: cv.base64,
      },
    });
  }
  content.push({ type: "text", text: userMessage });

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as {
    content: { type: string; text?: string }[];
    usage?: Record<string, unknown>;
  };
  const textBlock = result.content?.find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("No text block in Claude response");
  return textBlock.text;
}

function parseJsonResponse(raw: string): Record<string, unknown> {
  // Strip markdown code fences if present + extract first balanced JSON
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  // If preamble present, find first { and matching final }
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) throw new Error("No JSON object in response");
  const lastBrace = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

// ---------- Per-applicant staff context (Phase A: Reassess) ----------
//
// When the caller sets includeStaffContext=true, fold everything staff has
// already said about THIS specific applicant into the system prompt as a
// REFINEMENT guide. Distinct from global staff_guidance (which generalises
// across all apps).

interface PerAppContextInputs {
  supabase: SupabaseClient;
  applicationId: string;
}

interface PerAppContextResult {
  contextText: string;
  feedbackCount: number;
  decisionCount: number;
  inboundCount: number;
}

async function buildPerApplicantContext(
  input: PerAppContextInputs,
): Promise<PerAppContextResult> {
  const [fb, dec, inb] = await Promise.all([
    input.supabase
      .from("cvp_prescreen_flag_feedback")
      .select("flag_kind, flag_text, verdict, staff_notes")
      .eq("application_id", input.applicationId)
      .order("created_at", { ascending: true }),
    input.supabase
      .from("cvp_application_decisions")
      .select("action, staff_notes, ai_output, created_at")
      .eq("application_id", input.applicationId)
      .order("created_at", { ascending: true }),
    input.supabase
      .from("cvp_inbound_emails")
      .select(
        "from_email, subject, stripped_text, body_plain, classified_intent, received_at",
      )
      .eq("matched_application_id", input.applicationId)
      .order("received_at", { ascending: true })
      .limit(20),
  ]);

  const feedback = fb.data ?? [];
  const decisions = dec.data ?? [];
  const inbound = inb.data ?? [];

  if (feedback.length === 0 && decisions.length === 0 && inbound.length === 0) {
    return {
      contextText: "",
      feedbackCount: 0,
      decisionCount: 0,
      inboundCount: 0,
    };
  }

  const lines: string[] = [];
  lines.push("=====================================================================");
  lines.push("PER-APPLICANT STAFF CONTEXT (refine your prior assessment)");
  lines.push("=====================================================================");
  lines.push("");
  lines.push(
    "Staff has already reviewed the prior AI assessment for THIS specific",
  );
  lines.push("applicant. Treat this feedback as a targeted REFINEMENT, not general");
  lines.push("policy. Incorporate it directly into your updated scoring:");
  lines.push("");
  lines.push(
    "- Flags staff marked INVALID: DO NOT include in red_flags on the re-run.",
  );
  lines.push(
    "- Green flags (assets) staff marked INVALID: MOVE to red_flags if staff's",
  );
  lines.push("  note indicates the signal is actually a concern.");
  lines.push(
    "- Flags marked CONTEXT_DEPENDENT: use judgement + staff's note; keep only",
  );
  lines.push("  if the evidence still applies in this applicant's specific context.");
  lines.push(
    "- Flags marked LOW_WEIGHT: keep but soften wording; don't drive rejection.",
  );
  lines.push("- Flags marked VALID: keep as-is (staff confirmed).");
  lines.push(
    "- Staff notes are internal reasoning — fold the spirit into your notes,",
  );
  lines.push("  but never quote raw internal language verbatim.");
  lines.push("");

  if (feedback.length > 0) {
    lines.push(`FLAG VERDICTS (${feedback.length}):`);
    for (const f of feedback) {
      const kind = f.flag_kind === "red_flag" ? "[RED]" : "[ASSET]";
      const note = f.staff_notes ? ` — Staff note: "${f.staff_notes}"` : "";
      lines.push(
        `  ${kind} (${f.verdict}): "${f.flag_text}"${note}`,
      );
    }
    lines.push("");
  }

  if (decisions.length > 0) {
    lines.push(`DECISIONS TAKEN (${decisions.length}):`);
    for (const d of decisions) {
      const note = d.staff_notes ? ` — Staff notes: "${d.staff_notes}"` : "";
      const ai = d.ai_output ? ` — AI sent: "${String(d.ai_output).slice(0, 200)}…"` : "";
      lines.push(`  [${d.action}] at ${d.created_at}${note}${ai}`);
    }
    lines.push("");
  }

  if (inbound.length > 0) {
    lines.push(`APPLICANT REPLIES RECEIVED (${inbound.length}):`);
    for (const i of inbound) {
      const body = (i.stripped_text || i.body_plain || "").slice(0, 500);
      lines.push(
        `  From ${i.from_email} on ${i.received_at} (${i.classified_intent ?? "other"}):`,
      );
      lines.push(`    Subject: ${i.subject ?? ""}`);
      lines.push(`    Body: ${body.replace(/\s+/g, " ")}`);
    }
    lines.push("");
  }

  lines.push(
    "When you re-run: produce a NEW overall_score that reflects the refined",
  );
  lines.push("view. Explicitly revise red_flags and assets per the verdicts above.");
  lines.push("");

  return {
    contextText: lines.join("\n"),
    feedbackCount: feedback.length,
    decisionCount: decisions.length,
    inboundCount: inbound.length,
  };
}

// Retry-once helper
async function callClaudeWithRetry(
  systemPrompt: string,
  userMessage: string,
  cv: CvFetchResult,
  maxTokens: number,
  model: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await callClaude(systemPrompt, userMessage, cv, maxTokens, model);
    return parseJsonResponse(raw);
  } catch (firstErr) {
    console.error("First Claude call failed, retrying once:", firstErr);
    await new Promise((r) => setTimeout(r, 1500));
    const raw = await callClaude(systemPrompt, userMessage, cv, maxTokens, model);
    return parseJsonResponse(raw);
  }
}

// ---------- Main handler ----------

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as {
      applicationId?: string;
      includeStaffContext?: boolean;  // Phase A — reassess with this app's feedback
    };
    const { applicationId } = body;
    const includeStaffContext = body.includeStaffContext === true;
    if (!applicationId) {
      return jsonResponse({ success: false, error: "applicationId is required" }, 400);
    }

    await supabase
      .from("cvp_applications")
      .update({ status: "prescreening", updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    const { data: application, error: fetchError } = await supabase
      .from("cvp_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      console.error("Error fetching application:", fetchError);
      return jsonResponse({ success: false, error: "Application not found" }, 404);
    }

    const app = application as unknown as ApplicationRow;

    // ---- Download CV (best-effort) ----
    const cv = await fetchCv(supabase, app.cv_storage_path);
    if (!cv.read) {
      console.warn(
        `CV not read for application ${applicationId}: ${cv.error}`,
      );
    }

    // ---- Safe mode: while active, no auto-advance + no auto V2/V8 email ----
    const safeMode = await getSafeModeStatus(supabase);

    // ---- Build staff-guidance prefix from prior verdicts (global learning) ----
    // Aggregates cvp_prescreen_flag_feedback rows where staff marked the same
    // red flag as `invalid` ≥2x with ≥70% invalid rate; tells Claude not to
    // repeat them. Gracefully empty if migration 015 isn't applied yet.
    const guidance = await buildPrescreenGuidance(supabase);

    // ---- Per-applicant staff context (Phase A: only when reassessing) ----
    const perAppContext = includeStaffContext
      ? await buildPerApplicantContext({ supabase, applicationId })
      : {
          contextText: "",
          feedbackCount: 0,
          decisionCount: 0,
          inboundCount: 0,
        };

    const promptVersion = includeStaffContext
      ? "v4-reassessed-with-staff-context"
      : guidance.patternCount > 0
      ? PROMPT_VERSION_GUIDED
      : PROMPT_VERSION_BASE;

    // Reassessment uses the Opus-tier model for highest accuracy on
    // decision-quality work. Routine prescreens stay on the Sonnet tier.
    const modelUsed = includeStaffContext ? MODEL_QUALITY : MODEL_BASELINE;
    if (guidance.error) {
      console.warn(
        `Prescreen guidance fetch errored (continuing without):`,
        guidance.error,
      );
    } else if (guidance.patternCount > 0) {
      console.log(
        `Prescreen guidance applied: ${guidance.patternCount} suppression patterns from ${guidance.totalFeedbackRows} verdicts`,
      );
    }

    let aiResult: Record<string, unknown>;
    let aiScore: number;
    let newStatus: string;
    let assignedTier: string | null = null;

    try {
      if (app.role_type === "translator") {
        const { data: combinations } = await supabase
          .from("cvp_test_combinations")
          .select(
            "id, domain, service_type, source_language:source_language_id(name), target_language:target_language_id(name)",
          )
          .eq("application_id", applicationId);

        const pairsDescription =
          (combinations as unknown as TestCombination[] | null)
            ?.map(
              (c) =>
                `${c.source_language.name} → ${c.target_language.name} (${c.domain}, ${c.service_type})`,
            )
            .join("; ") ?? "No combinations";

        const cvNote = cv.read
          ? "CV is attached above. Read it carefully and cross-check the form claims below against the CV."
          : `No CV could be read (reason: ${cv.error}). Score on form data alone and set cv_quality / cv_corroborates_form to "not_readable".`;

        const userMessage = `${cvNote}

Form data:
Name: ${app.full_name}
Country: ${app.country}
Years of experience: ${app.years_experience ?? "Not specified"}
Education: ${app.education_level ?? "Not specified"}
Certifications: ${JSON.stringify(app.certifications ?? [])}
CAT tools: ${(app.cat_tools ?? []).join(", ") || "None"}
Services offered: ${(app.services_offered ?? []).join(", ")}
Language pairs and domains: ${pairsDescription}
Rate expectation (CAD/page): ${app.rate_expectation ?? "Not specified"}
Additional notes: ${app.notes ?? "None"}`;

        const translatorSystemPrompt = [
          perAppContext.contextText,
          guidance.guidanceText,
          TRANSLATOR_SYSTEM_PROMPT,
        ]
          .filter((s) => s && s.length > 0)
          .join("\n\n---\n\n");

        aiResult = await callClaudeWithRetry(
          translatorSystemPrompt,
          userMessage,
          cv,
          4000,
          modelUsed,
        );

        const result = aiResult as unknown as PrescreenResult;
        aiScore = result.overall_score;
        assignedTier = result.suggested_tier ?? null;

        // Routing policy (per April 2026 decisions):
        //   AI never auto-rejects. AI is recommendation-only for low scores —
        //   staff must explicitly approve a rejection from admin UI before the
        //   V12 email is queued.
        //
        //   Safe mode (first 30d OR 200 approved apps, whichever first): AI
        //   also never auto-advances to 'prescreened'. ALL apps land in
        //   staff_review with AI's recommendation preserved for the admin to
        //   act on. Staff must explicitly click "Approve advance — send V2"
        //   or "Acknowledge — send V8 manual review" to trigger the outbound.
        //
        //   Once safe mode lifts: score >= 70 resumes auto-advance to
        //   'prescreened' + V2 email.
        if (!safeMode.active && aiScore >= 70) {
          newStatus = "prescreened";
        } else {
          newStatus = "staff_review";
        }
      } else {
        // Cognitive debriefing
        const cvNote = cv.read
          ? "CV is attached above. Read it carefully and cross-check the form claims below against the CV."
          : `No CV could be read (reason: ${cv.error}). Score on form data alone and set cv_quality / cv_corroborates_form to "not_readable".`;

        const userMessage = `${cvNote}

Form data:
Name: ${app.full_name}
Country: ${app.country}
Years of debriefing experience: ${app.cog_years_experience ?? "Not specified"}
Education: ${app.education_level ?? "Not specified"}
Degree field: ${app.cog_degree_field ?? "Not specified"}
Credentials: ${app.cog_credentials ?? "None"}
COA/PRO instrument types: ${(app.cog_instrument_types ?? []).join(", ")}
Therapy areas: ${(app.cog_therapy_areas ?? []).join(", ")}
Pharma/CRO clients: Confidential (provided: ${app.cog_pharma_clients ? "Yes" : "No"})
ISPOR familiarity: ${app.cog_ispor_familiarity ?? "Not specified"}
FDA COA familiarity: ${app.cog_fda_familiarity ?? "Not specified"}
Prior debrief report writing: ${app.cog_prior_debrief_reports ? "Yes" : "No"}`;

        const cogSystemPrompt = [
          perAppContext.contextText,
          guidance.guidanceText,
          COG_DEBRIEF_SYSTEM_PROMPT,
        ]
          .filter((s) => s && s.length > 0)
          .join("\n\n---\n\n");

        aiResult = await callClaudeWithRetry(
          cogSystemPrompt,
          userMessage,
          cv,
          4000,
          modelUsed,
        );

        const result = aiResult as unknown as CogPrescreenResult;
        aiScore = result.overall_score;
        newStatus = "staff_review"; // always staff review for cog debrief
      }
    } catch (aiError) {
      console.error(
        "AI pre-screening failed, falling back to staff_review:",
        aiError,
      );
      aiResult = {
        error: "ai_fallback",
        reason: aiError instanceof Error ? aiError.message : "Unknown AI error",
      };
      aiScore = 0;
      newStatus = "staff_review";
      assignedTier = null;
    }

    // ---- Stamp observability fields onto every result ----
    aiResult.cv_read = cv.read;
    aiResult.cv_read_error = cv.error;
    aiResult.model_used = modelUsed;
    aiResult.prompt_version = promptVersion;
    aiResult.staff_guidance_count = guidance.patternCount;
    aiResult.staff_guidance_total_verdicts = guidance.totalFeedbackRows;
    aiResult.safe_mode_active = safeMode.active;
    aiResult.safe_mode_reason = safeMode.reason;
    aiResult.reassessed_with_staff_context = includeStaffContext;
    if (includeStaffContext) {
      aiResult.per_app_context = {
        flag_feedback_count: perAppContext.feedbackCount,
        decision_count: perAppContext.decisionCount,
        inbound_count: perAppContext.inboundCount,
      };
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      ai_prescreening_score: aiScore,
      ai_prescreening_result: aiResult,
      ai_prescreening_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (assignedTier) updateData.assigned_tier = assignedTier;

    // Belt-and-suspenders: if a previous prescreen run auto-queued a rejection
    // (legacy behaviour), clear it on every re-run so AI can never email the
    // applicant a rejection without admin sign-off.
    if (newStatus !== "rejected") {
      updateData.rejection_email_status = null;
      updateData.rejection_email_queued_at = null;
      updateData.rejection_reason = null;
      updateData.can_reapply_after = null;
    }

    const { error: updateError } = await supabase
      .from("cvp_applications")
      .update(updateData)
      .eq("id", applicationId);

    if (updateError) {
      console.error(
        "Error updating application with prescreen results:",
        updateError,
      );
    }

    // Send V2/V8 automatically ONLY when safe mode is off + AI succeeded.
    // While safe mode is on, the admin UI surfaces an "AI recommends X — send
    // V2/V8?" callout that routes through cvp-approve-prescreen-outcome.
    try {
      const aiFailed = aiResult.error === "ai_fallback";
      if (!safeMode.active && newStatus !== "rejected" && !aiFailed) {
        const appNumber = (application as Record<string, unknown>)
          .application_number as string;
        const roleTypeLabel =
          app.role_type === "translator"
            ? "Translator / Reviewer"
            : "Cognitive Debriefing Consultant";
        const tpl =
          newStatus === "prescreened"
            ? buildV2PrescreenPassed({
                fullName: app.full_name,
                applicationNumber: appNumber,
                roleType: roleTypeLabel,
              })
            : buildV8UnderManualReview({
                fullName: app.full_name,
                applicationNumber: appNumber,
                roleType: roleTypeLabel,
              });
        await sendMailgunEmail({
          to: { email: app.email, name: app.full_name },
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          respectDoNotContactFor: app.email,
          tags: [
            newStatus === "prescreened"
              ? "v2-prescreen-passed"
              : "v8-manual-review",
            applicationId,
          ],
        });
      } else if (safeMode.active) {
        console.log(
          `Safe mode active (${safeMode.reason}) — skipping auto V2/V8 for ${applicationId}; staff must approve outbound.`,
        );
      }
    } catch (emailError) {
      console.error("Error sending prescreen result email:", emailError);
    }

    // ---- Auto-send General test (April 2026 policy) ----
    // Translator applicants whose AI score is ≥40 and who don't trip a critical
    // flag get the General test sent automatically. Other domains stay
    // staff-gated — admin (or vendor self-serve later) requests them on demand.
    // CV-vs-application mismatches are LOW severity by policy and don't block
    // here; only direct CV contradictions or fraud-type flags do. See
    // _shared/red-flag-weights.ts.
    try {
      const aiFailed = aiResult.error === "ai_fallback";
      const isTranslator = app.role_type === "translator";
      const flags = (aiResult as Record<string, unknown>).red_flags as
        | string[]
        | undefined;
      const cvCorroborates = (aiResult as Record<string, unknown>)
        .cv_corroborates_form as string | undefined;

      if (isTranslator && !aiFailed && newStatus !== "rejected") {
        const decision = shouldAutoSendTest({
          score: aiScore,
          cvCorroborates,
          flags,
          safeMode: safeMode.active,
        });
        if (decision.allowed) {
          // Fire-and-forget. Under the applicant-choice routing (rolled
          // out 2026-05-15), pre-screen success no longer dispatches a
          // translation test directly — it issues a chooser invitation
          // letting the applicant pick between the translation-test path
          // and the ISO competence quiz path. The chosen path is
          // dispatched downstream by cvp-record-instrument-choice. The
          // EN→Target + general-domain restriction is enforced inside
          // that function when it routes to the test path.
          const fnUrl =
            (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "") +
            "/functions/v1/cvp-send-instrument-choice-invitation";
          fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
              }`,
            },
            body: JSON.stringify({ applicationId }),
          }).catch((e) =>
            console.error(
              `Auto-send choice invitation failed for ${applicationId}:`,
              e instanceof Error ? e.message : String(e),
            ),
          );
          console.log(
            `Auto-send General queued for ${applicationId} (score=${aiScore}, flags=${flags?.length ?? 0}, breakdown=${JSON.stringify(decision.breakdown)})`,
          );
        } else {
          console.log(
            `Auto-send General skipped for ${applicationId}: ${decision.reason} (score=${aiScore})`,
          );
        }
      }
    } catch (autoSendErr) {
      console.error(
        `Error in auto-send-General hook for ${applicationId}:`,
        autoSendErr,
      );
    }

    return jsonResponse({
      success: true,
      data: {
        applicationId,
        score: aiScore,
        status: newStatus,
        tier: assignedTier,
        cv_read: cv.read,
        cv_read_error: cv.error,
        prompt_version: promptVersion,
        model_used: modelUsed,
        staff_guidance_count: guidance.patternCount,
        staff_guidance_total_verdicts: guidance.totalFeedbackRows,
      },
    });
  } catch (err) {
    console.error("Unhandled error in cvp-prescreen-application:", err);
    return jsonResponse(
      { success: false, error: "An unexpected error occurred." },
      500,
    );
  }
});
