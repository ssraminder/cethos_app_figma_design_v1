// cvp-coa-assess-translation
//
// COA quiz Part 2 grader. Takes an applicant's translation of one short English
// COA sentence into their native language and grades it REFERENCE-FREE using
// MQM error annotation by Claude. Deterministic score is computed here from the
// AI's error severities (the house "deterministic value + AI prose" split).
// Every grade is persisted to cvp_coa_translation_responses for ISO 17100
// reproducibility, and low-confidence / low-resource-language / borderline
// results are flagged for human spot-check.
//
// POST { itemId, targetLanguageCode, targetLanguageName?, translation, applicationId? }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { MODEL_QUALITY } from "../_shared/ai-models.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Reference-free AI MQM grading is reliable for high-resource languages; for
// others we still grade but always flag for human spot-check.
const HIGH_RESOURCE = new Set(["es", "fr", "de", "pt", "it", "nl"]);

// MQM severity penalties (absolute, per short-sentence item).
const PENALTY: Record<string, number> = { minor: 2, major: 10, critical: 25 };
const ACCURACY_CATS = new Set(["accuracy", "mistranslation", "omission", "addition", "terminology"]);

interface MqmError { category: string; severity: "minor" | "major" | "critical"; explanation: string }
interface AiResult {
  errors: MqmError[];
  conceptual_equivalence: "preserved" | "partial" | "lost";
  confidence: number;
  summary: string;
}

const SYSTEM_PROMPT =
  `You are an expert MQM (Multidimensional Quality Metrics) error annotator for the linguistic validation of Clinical Outcome Assessment (COA) instruments. You grade an applicant's translation of ONE short English sentence into a target language, WITHOUT a stored reference translation — judge it against the source meaning and the item's conceptual-equivalence requirement using your own knowledge of the target language.

Return ONLY valid JSON (no markdown, no preamble):
{
  "errors": [ { "category": "accuracy|mistranslation|omission|addition|terminology|fluency|grammar|style|register|locale_conventions", "severity": "minor|major|critical", "explanation": "short, specific" } ],
  "conceptual_equivalence": "preserved" | "partial" | "lost",
  "confidence": 0.0-1.0,
  "summary": "one or two sentences"
}

COA grading principles:
- Aim is CONCEPTUAL equivalence, not literal/word-for-word. A faithful, natural patient-facing rendering with different wording is CORRECT — do not flag it.
- A meaning change, a wrong/omitted concept, or an idiom translated literally so the meaning is lost = a MAJOR or CRITICAL accuracy error, and conceptual_equivalence is "partial" or "lost".
- Wrong patient register (e.g. informal where formal is required) = major style/register error.
- Frequency/severity scale terms must stay correctly ordered and mutually distinct; collapsing or reordering them = major.
- If the translation is empty, in the wrong language, or nonsensical = one "critical" accuracy error and conceptual_equivalence "lost".
- Be calibrated: minor = small fluency/style slips that don't affect meaning; major = meaning or usability affected; critical = renders the item unusable or harmful.
- confidence reflects how sure you are about grading THIS target language (lower for languages you are less reliable in).`;

async function gradeWithClaude(
  sourceText: string,
  guidance: string,
  targetLanguageName: string,
  translation: string,
): Promise<{ ok: true; result: AiResult; model: string } | { ok: false; error: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  const userMessage =
    `Target language: ${targetLanguageName}\n\nSource (English): ${sourceText}\n\nItem grading guidance: ${guidance}\n\nApplicant's translation:\n${translation}\n\nGrade the translation now. Return only the JSON object.`;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL_QUALITY,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) return { ok: false, error: `Claude API ${resp.status}: ${await resp.text()}` };
    const data = await resp.json() as { content: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1) return { ok: false, error: "No JSON in Claude response" };
    const parsed = JSON.parse(text.slice(first, last + 1)) as AiResult;
    return { ok: true, result: parsed, model: MODEL_QUALITY };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function scoreFromErrors(errors: MqmError[]): { score: number; counts: Record<string, number> } {
  const counts = { critical: 0, major: 0, minor: 0 } as Record<string, number>;
  let penalty = 0;
  for (const e of errors ?? []) {
    const sev = (e.severity ?? "minor").toLowerCase();
    if (sev in counts) counts[sev] += 1;
    penalty += PENALTY[sev] ?? 2;
  }
  return { score: Math.max(0, 100 - penalty), counts };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: {
    itemId?: string;
    targetLanguageCode?: string;
    targetLanguageName?: string;
    translation?: string;
    applicationId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  const { itemId, targetLanguageCode, translation, applicationId } = body;
  if (!itemId || !targetLanguageCode || !translation?.trim()) {
    return json({ success: false, error: "itemId, targetLanguageCode and translation are required" }, 400);
  }

  const { data: item, error: itemErr } = await sb
    .from("cvp_coa_translation_items")
    .select("id, source_text, construct, grading_guidance")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr || !item) return json({ success: false, error: "item_not_found" }, 404);

  const langName = body.targetLanguageName ?? targetLanguageCode;
  const graded = await gradeWithClaude(
    item.source_text as string,
    item.grading_guidance as string,
    langName,
    translation,
  );

  const now = new Date().toISOString();
  let row: Record<string, unknown>;

  if (!graded.ok) {
    // AI failure → record + always flag for human review; never silently pass/fail.
    row = {
      application_id: applicationId ?? null,
      item_id: itemId,
      target_language_code: targetLanguageCode,
      target_language_name: langName,
      applicant_translation: translation,
      mqm_annotations: null,
      error_counts: null,
      mqm_score: null,
      verdict: null,
      conceptual_equivalence: null,
      ai_confidence: null,
      ai_rationale: `AI grading failed: ${graded.error}`,
      needs_human_review: true,
      model_version: MODEL_QUALITY,
      graded_at: now,
    };
    await sb.from("cvp_coa_translation_responses").insert(row);
    return json({ success: false, error: "ai_grading_failed", detail: graded.error, needs_human_review: true });
  }

  const r = graded.result;
  const { score, counts } = scoreFromErrors(r.errors ?? []);
  const hasCritical = counts.critical > 0;
  const hasMajorAccuracy = (r.errors ?? []).some(
    (e) => (e.severity ?? "").toLowerCase() === "major" && ACCURACY_CATS.has((e.category ?? "").toLowerCase()),
  );
  // COA-strict: zero major/critical accuracy; conceptual equivalence must hold.
  let verdict: "pass" | "borderline" | "fail";
  if (hasCritical || hasMajorAccuracy || r.conceptual_equivalence === "lost") verdict = "fail";
  else if (score < 85 || r.conceptual_equivalence === "partial") verdict = "borderline";
  else verdict = "pass";

  const langPrefix = targetLanguageCode.toLowerCase().split("-")[0];
  const needsReview =
    verdict === "borderline" ||
    (typeof r.confidence === "number" && r.confidence < 0.7) ||
    !HIGH_RESOURCE.has(langPrefix);

  row = {
    application_id: applicationId ?? null,
    item_id: itemId,
    target_language_code: targetLanguageCode,
    target_language_name: langName,
    applicant_translation: translation,
    mqm_annotations: r.errors ?? [],
    error_counts: counts,
    mqm_score: score,
    verdict,
    conceptual_equivalence: r.conceptual_equivalence ?? null,
    ai_confidence: r.confidence ?? null,
    ai_rationale: r.summary ?? null,
    needs_human_review: needsReview,
    model_version: MODEL_QUALITY,
    graded_at: now,
  };
  const { data: inserted, error: insErr } = await sb
    .from("cvp_coa_translation_responses")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (insErr) return json({ success: false, error: `db_insert_failed: ${insErr.message}` }, 500);

  return json({
    success: true,
    data: {
      responseId: inserted?.id ?? null,
      score,
      verdict,
      conceptual_equivalence: r.conceptual_equivalence,
      error_counts: counts,
      errors: r.errors ?? [],
      confidence: r.confidence,
      needs_human_review: needsReview,
      summary: r.summary,
      model_version: MODEL_QUALITY,
    },
  });
});
