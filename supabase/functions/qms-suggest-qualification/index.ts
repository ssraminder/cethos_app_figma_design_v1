// qms-suggest-qualification — AI-powered form pre-fill for "Mark vendor qualified".
// Reads the vendor's QMS evidence locker + profile, calls Claude Haiku to pick the
// strongest ISO 17100 §3.1.4 competence basis, best supporting evidence item, and
// drafts verification notes. Also returns active language pairs for pre-fill.
//
// POST { vendor_id, evidence, vendor_type, years_experience }
// Returns { success, suggestions: { basisCode, evidenceTypeCode, evidenceTitle,
//   evidenceOrg, evidenceIssued, verificationNotes }, languagePairs }

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BASES_FOR_ROLE: Record<string, { code: string; label: string }[]> = {
  translator: [
    { code: "t_a_degree_translation", label: "Recognized degree in translation" },
    { code: "t_b_degree_other_plus_2y", label: "Degree (other field) + 2 years documented experience" },
    { code: "t_c_5y_experience", label: "5 years documented experience (no degree)" },
  ],
  reviser: [
    { code: "r_translator_plus_revision", label: "Translator competence + revision experience" },
  ],
  reviewer: [
    { code: "rev_domain_specialist", label: "Domain specialist — qualification and/or experience" },
  ],
  post_editor: [
    { code: "pe_translator_plus_pemt", label: "Translator competence + PEMT training/experience" },
  ],
  interpreter: [
    { code: "i_training_plus_proficiency", label: "Recognized interpreter training + verified proficiency" },
    { code: "i_5y_experience", label: "5 years documented interpreting experience" },
  ],
};

const EVIDENCE_TYPES = [
  { code: "degree_translation", name: "Recognized degree in translation" },
  { code: "degree_other", name: "Recognized degree in other field" },
  { code: "documented_translation_experience", name: "Documented professional translation experience" },
  { code: "references_verified", name: "References verified" },
  { code: "internal_test_passed", name: "Internal qualification test passed" },
  { code: "professional_membership", name: "Professional membership" },
  { code: "domain_specific_certification", name: "Domain-specific certification" },
  { code: "mt_post_editing_training", name: "MT post-editing training" },
  { code: "language_proficiency_test", name: "Language proficiency test result" },
  { code: "other_document", name: "Other uploaded document" },
];

function mapVendorTypeToRole(vendorType: string): string {
  const map: Record<string, string> = {
    translator: "translator",
    reviser: "reviser",
    reviewer: "reviewer",
    post_editor: "post_editor",
    interpreter: "interpreter",
    cognitive_debriefing: "translator",
  };
  return map[vendorType] ?? "translator";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { vendor_id: string; evidence?: unknown[]; vendor_type?: string; years_experience?: number | null };
  try { body = await req.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }

  if (!body.vendor_id) return json({ success: false, error: "vendor_id required" }, 400);

  // Load active language pairs for this vendor
  const { data: langPairs } = await supabase
    .from("vendor_language_pairs")
    .select("source_language, target_language")
    .eq("vendor_id", body.vendor_id)
    .eq("is_active", true)
    .order("source_language");

  const roleCode = mapVendorTypeToRole(body.vendor_type ?? "translator");
  const validBases = BASES_FOR_ROLE[roleCode] ?? BASES_FOR_ROLE.translator;
  const evidence = (body.evidence ?? []) as Array<Record<string, unknown>>;

  // Build compact evidence summary — trim verification notes to avoid huge prompts
  const evidenceSummary = evidence.slice(0, 8).map((e, i) => {
    const notes = String(e.verification_notes ?? "").slice(0, 500);
    const tier = e.tier ?? (e.verified ? "verified" : "screened");
    return `[${i + 1}] Title: "${e.title}" | Type: ${e.evidence_type ?? "unknown"} | Org: ${e.issuing_organization ?? "—"} | Issued: ${e.issued_date ?? "—"} | Tier: ${tier}\n    Notes: ${notes}`;
  }).join("\n\n");

  const systemPrompt = `You are an ISO 17100 qualification advisor for a translation agency QMS.
Given evidence items from a vendor's locker, pick the best qualification basis and primary evidence item.
Respond ONLY with a raw JSON object — no markdown fences, no preamble:
{
  "basisCode": "<one valid basis code>",
  "evidenceTypeCode": "<one valid evidence type code>",
  "evidenceTitle": "<title to enter in the form>",
  "evidenceOrg": "<issuing organization, or empty string if unknown>",
  "evidenceIssued": "<YYYY-MM-DD if available, else empty string>",
  "verificationNotes": "<1–2 sentence draft for the QMS record — what was verified, any caveats to flag for the reviewer>"
}`;

  const userMsg = `Vendor role: ${roleCode} | Years experience declared: ${body.years_experience ?? "unknown"}

Valid basis codes:
${validBases.map((b) => `• ${b.code}: ${b.label}`).join("\n")}

Valid evidence type codes:
${EVIDENCE_TYPES.map((t) => `• ${t.code}: ${t.name}`).join("\n")}

Evidence items in locker:
${evidenceSummary || "(no evidence items — locker is empty)"}

Rules:
1. Prefer the strongest basis: t_a (translation degree) > t_b (other degree + 2y) > t_c (5y experience).
2. Pick the evidence item that most directly supports the chosen basis.
3. If only experience/reference evidence exists, use t_c and pick the best reference or CV.
4. If an AI concern flag appears in the notes (e.g. MISMATCH, name mismatch, self-authored), note it briefly in verificationNotes so the reviewer knows to check.`;

  let suggestions: Record<string, string> = {};

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const aiData = await resp.json();
    const rawText = (aiData?.content?.[0]?.text ?? "") as string;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) suggestions = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("qms-suggest-qualification: Claude call failed", e);
    // Deterministic fallback — pick the first evidence item
    if (evidence.length > 0) {
      const best = evidence[0] as Record<string, unknown>;
      suggestions = {
        basisCode: roleCode === "translator" ? "t_c_5y_experience" : (validBases[0]?.code ?? ""),
        evidenceTypeCode: String(best.evidence_type ?? "other_document"),
        evidenceTitle: String(best.title ?? ""),
        evidenceOrg: String(best.issuing_organization ?? ""),
        evidenceIssued: String(best.issued_date ?? ""),
        verificationNotes: "AI pre-fill unavailable — please review evidence manually.",
      };
    }
  }

  return json({
    success: true,
    suggestions,
    languagePairs: (langPairs ?? []) as { source_language: string; target_language: string }[],
  });
});
