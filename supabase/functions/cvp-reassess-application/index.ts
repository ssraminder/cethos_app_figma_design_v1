// cvp-reassess-application
//
// Staff-triggered. Once references are in (or any time after, really —
// staff can re-run), this gathers the full application snapshot — form
// data, AI prescreening result, every test combination + score, every
// reference + feedback + per-reference AI analysis — and asks
// Claude Sonnet 4.6 for a fresh verdict and a subset of combinations
// that the evidence supports approving.
//
// Output is structured JSON, persisted to cvp_application_ai_reassessments.
// The admin recruitment-detail page reads the latest row and pre-fills
// the approve modal with the AI-suggested domains and per-domain rationale.
//
// POST /functions/v1/cvp-reassess-application
// Body: { applicationId: string }
//
// Auth: requireStaff (the assessment row records staff_users.id as the
// trigger so we can audit who ran what when).
//
// The function is non-blocking on AI failures — if Claude errors, we
// still persist a row with `ai_error` populated so staff can see the
// failure in the UI and retry.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { MODEL_REASSESS } from "../_shared/ai-models.ts";
import { requireStaff } from "../_shared/require-staff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are reviewing a translator application for CETHOS, a Canadian certified-translation company. The application has completed test grading and reference checks. Your job: produce a structured final verdict and pick exactly which (domain × language pair) combinations the accumulated evidence supports approving the applicant for.

Decision rules:
- Approve a combination only when there is *positive corroborating evidence* on the relevant pair + domain: a passing test, OR consistent reference signal naming that domain.
- Be conservative. If the only signal for a domain is the applicant's own self-declaration with no test result and no reference confirmation, DO NOT include it.
- General-domain combos that passed a test can be approved without domain-specific confirmation.
- References that flag concerns (low ratings, year/domain contradictions, low competence MCQ answers) downgrade related combos even if a test passed.
- Verdict 'approve' means at least one combination is approvable. 'waitlist' means evidence is mixed or thin — applicant has potential but more data is needed. 'reject' means the evidence actively disqualifies.

Output STRICT JSON only. No prose outside the JSON. No markdown fences. Schema:
{
  "verdict": "approve" | "waitlist" | "reject",
  "verdict_confidence": "high" | "medium" | "low",
  "suggested_combination_ids": [<combination_id_string>, ...],
  "domain_evidence": {
    "<combination_id>": "one short sentence citing the specific test score and/or reference name that supports this domain"
  },
  "rationale": "2-3 sentence summary explaining the overall verdict for the staff card",
  "concerns": ["short bullet", ...],
  "follow_ups": ["short bullet", ...]
}

Use the EXACT combination_id strings from the input — do not invent new IDs. domain_evidence must include exactly the IDs in suggested_combination_ids (no more, no fewer). concerns + follow_ups may be empty arrays.`;

interface RefSnapshot {
  reference_name: string;
  reference_company: string | null;
  reference_relationship: string | null;
  status: string;
  feedback_rating: number | null;
  feedback_text: string | null;
  applicant_stated_start_year: number | null;
  reference_confirmed_start_year: number | null;
  year_verification: string | null;
  applicant_stated_domains: string[] | null;
  reference_confirmed_domains: string[] | null;
  domain_verification: string | null;
  competence_responses: unknown;
  ai_analysis: unknown;
  declined_at: string | null;
  decline_reason: string | null;
}

interface ComboSnapshot {
  combination_id: string;
  domain: string | null;
  source_language: string;
  target_language: string;
  service_type: string | null;
  status: string;
  ai_score: number | null;
  ai_assessment_result: unknown;
  is_baseline_general: boolean;
  submission: {
    status: string | null;
    submitted_at: string | null;
    ai_assessment_score: number | null;
    ai_assessment_result: unknown;
  } | null;
}

interface ApplicationSnapshot {
  application_id: string;
  application_number: string;
  full_name: string;
  email: string;
  country: string | null;
  years_experience: number | null;
  education_level: string | null;
  certifications: unknown;
  cat_tools: unknown;
  domains_offered: unknown;
  ai_prescreening_score: number | null;
  ai_prescreening_result: unknown;
  combinations: ComboSnapshot[];
  references: RefSnapshot[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authed = await requireStaff(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);
  const staffId = authed.staff.staffId;

  let body: { applicationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.applicationId) {
    return json({ success: false, error: "applicationId_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ---- Load the snapshot ----
  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select(
      "id, application_number, full_name, email, country, years_experience, education_level, certifications, cat_tools, domains_offered, ai_prescreening_score, ai_prescreening_result",
    )
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) {
    return json({ success: false, error: "application_not_found" }, 404);
  }

  const { data: combos } = await supabase
    .from("cvp_test_combinations")
    .select(
      "id, domain, service_type, status, ai_score, ai_assessment_result, is_baseline_general, source_language_id, target_language_id, test_submission_id",
    )
    .eq("application_id", body.applicationId);

  // Resolve languages + submissions in bulk.
  const langIds = Array.from(
    new Set(
      (combos ?? []).flatMap((c) => [c.source_language_id, c.target_language_id]),
    ),
  );
  const langMap = new Map<string, string>();
  if (langIds.length > 0) {
    const { data: langs } = await supabase
      .from("languages")
      .select("id, code, name")
      .in("id", langIds);
    for (const l of (langs ?? []) as { id: string; code: string; name: string }[]) {
      langMap.set(l.id, l.name || l.code);
    }
  }

  const subIds = (combos ?? [])
    .map((c) => c.test_submission_id as string | null)
    .filter((s): s is string => Boolean(s));
  const subMap = new Map<string, ComboSnapshot["submission"]>();
  if (subIds.length > 0) {
    const { data: subs } = await supabase
      .from("cvp_test_submissions")
      .select("id, status, submitted_at, ai_assessment_score, ai_assessment_result")
      .in("id", subIds);
    for (const s of (subs ?? []) as Record<string, unknown>[]) {
      subMap.set(s.id as string, {
        status: (s.status as string | null) ?? null,
        submitted_at: (s.submitted_at as string | null) ?? null,
        ai_assessment_score: (s.ai_assessment_score as number | null) ?? null,
        ai_assessment_result: s.ai_assessment_result ?? null,
      });
    }
  }

  const comboSnapshots: ComboSnapshot[] = (combos ?? []).map((c) => ({
    combination_id: c.id as string,
    domain: (c.domain as string | null) ?? null,
    source_language: langMap.get(c.source_language_id as string) ?? "?",
    target_language: langMap.get(c.target_language_id as string) ?? "?",
    service_type: (c.service_type as string | null) ?? null,
    status: c.status as string,
    ai_score: (c.ai_score as number | null) ?? null,
    ai_assessment_result: c.ai_assessment_result ?? null,
    is_baseline_general: Boolean(c.is_baseline_general),
    submission: c.test_submission_id
      ? subMap.get(c.test_submission_id as string) ?? null
      : null,
  }));

  const { data: refs } = await supabase
    .from("cvp_application_references")
    .select(
      "reference_name, reference_company, reference_relationship, status, feedback_rating, feedback_text, applicant_stated_start_year, reference_confirmed_start_year, year_verification, applicant_stated_domains, reference_confirmed_domains, domain_verification, competence_responses, ai_analysis, declined_at, decline_reason",
    )
    .eq("application_id", body.applicationId)
    .order("created_at", { ascending: true });

  const refSnapshots: RefSnapshot[] = (refs ?? []) as RefSnapshot[];

  const snapshot: ApplicationSnapshot = {
    application_id: app.id as string,
    application_number: app.application_number as string,
    full_name: app.full_name as string,
    email: app.email as string,
    country: (app.country as string | null) ?? null,
    years_experience: (app.years_experience as number | null) ?? null,
    education_level: (app.education_level as string | null) ?? null,
    certifications: app.certifications ?? null,
    cat_tools: app.cat_tools ?? null,
    domains_offered: app.domains_offered ?? null,
    ai_prescreening_score: (app.ai_prescreening_score as number | null) ?? null,
    ai_prescreening_result: app.ai_prescreening_result ?? null,
    combinations: comboSnapshots,
    references: refSnapshots,
  };

  // ---- Call Claude ----
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  let outputJson: Record<string, unknown> | null = null;
  let rawOutput: string | null = null;
  let aiError: string | null = null;

  if (!apiKey) {
    aiError = "ANTHROPIC_API_KEY not configured";
  } else {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL_REASSESS,
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Application snapshot:\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n\nProduce the verdict JSON per the schema.`,
            },
          ],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        aiError = `Claude ${resp.status}: ${errBody.slice(0, 500)}`;
      } else {
        const r = await resp.json() as { content: { type: string; text?: string }[] };
        rawOutput = r.content?.find((b) => b.type === "text")?.text?.trim() ?? null;
        if (!rawOutput) {
          aiError = "empty_claude_response";
        } else {
          try {
            // Be tolerant of accidental code-fence wrappers despite the
            // explicit instruction in the system prompt.
            const stripped = rawOutput
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/, "")
              .trim();
            outputJson = JSON.parse(stripped) as Record<string, unknown>;
          } catch (parseErr) {
            aiError = `parse_failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
          }
        }
      }
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
    }
  }

  // Validate the IDs Claude returned actually belong to this application.
  if (outputJson && Array.isArray(outputJson.suggested_combination_ids)) {
    const validIds = new Set(comboSnapshots.map((c) => c.combination_id));
    const filtered = (outputJson.suggested_combination_ids as unknown[])
      .filter((id): id is string => typeof id === "string" && validIds.has(id));
    outputJson.suggested_combination_ids = filtered;
  }

  // Persist regardless of AI outcome — staff sees the failure in the UI.
  const { data: row, error: insErr } = await supabase
    .from("cvp_application_ai_reassessments")
    .insert({
      application_id: body.applicationId,
      model: MODEL_REASSESS,
      input_json: snapshot,
      output_json: outputJson,
      raw_output: rawOutput,
      ai_error: aiError,
      triggered_by: staffId,
    })
    .select("id, created_at")
    .single();

  if (insErr) {
    return json(
      { success: false, error: "persist_failed", detail: insErr.message },
      500,
    );
  }

  return json({
    success: true,
    data: {
      reassessmentId: row?.id,
      createdAt: row?.created_at,
      model: MODEL_REASSESS,
      output: outputJson,
      aiError,
    },
  });
});
