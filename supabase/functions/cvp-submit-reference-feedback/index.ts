/**
 * cvp-submit-reference-feedback
 *
 * Reference-facing endpoint. Validates a feedback_token, accepts the
 * reference's response (or decline), runs Opus analysis, fires V20
 * thank-you to the reference. V21 to the applicant is suppressed by
 * default per CLAUDE.md ("don't bombard applicants with auto-emails").
 *
 * Body modes:
 *   { feedbackToken, validateOnly: true }
 *     → returns the reference + applicant context for the public page.
 *
 *   { feedbackToken, action: "decline", reason? }
 *     → marks declined, no V20.
 *
 *   { feedbackToken, action: "submit", feedbackText, feedbackRating }
 *     → persists, runs Opus, fires V20.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV20ReferenceAck } from "../_shared/email-templates.ts";
import { MODEL_QUALITY } from "../_shared/ai-models.ts";

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

const ANALYSIS_SYSTEM_PROMPT = `You are analysing a professional reference's response about a translator applying to CETHOS. Output JSON ONLY in the structure below — no preamble, no markdown.

{
  "sentiment": "positive" | "neutral" | "mixed" | "negative",
  "strength_score": <integer 1-5; 5 = ringing endorsement, 1 = clear concerns>,
  "themes": [<short strings; 2-5 themes the reference highlighted, e.g. "domain expertise", "deadline reliability", "communication">],
  "red_flags": [<concrete concerns the reference raised; empty array if none>],
  "summary": <1-2 sentence neutral summary for staff to skim>,
  "verifies_relationship": true | false (does the response sound like someone who actually worked with the applicant in the way claimed)
}

Rules:
- Be calibrated. A reference who says "they were fine" is NOT positive — that's neutral / mildly positive at best.
- If the response is very short (<30 words), strength_score caps at 3 — minimal evidence.
- Red flags include: refusal to recommend, mentions of conflicts / professional issues, vague hedging, contradiction with the applicant's claims.
- The "Year verification" line in the input describes how the applicant's stated start year compares with the reference's recollection. If it says DISAGREES, you MUST include a red flag along the lines of "reference contradicts applicant's stated working timeline (X-year gap)". If it says MATCHES, you MAY mention "timeline corroborated" as a theme. cant_recall is not a red flag.
- The "Domain verification" line describes whether the reference confirmed at least one of the domains the applicant claimed they worked together on. DISJOINT (zero overlap, reference said they worked on something completely different) MUST be a red flag — applicant's claimed expertise is not corroborated by this reference. PARTIAL is the normal case (reference saw some but not all of the applicant's claimed work) — not a red flag. MATCHES MAY be a positive theme. cant_recall is not a red flag.
- The MCQ answers may come in two shapes. When "single answer set" — one rating per competence applies to all confirmed domains. When "separately for each confirmed domain" — interpret per-domain variance: if the reference rates the applicant 'a' (strong) in one domain and 'd' (weak) in another, surface that as a theme (e.g. "uneven by domain: strong in legal, weak in medical") and consider whether the weak domain crosses into red-flag territory. Letter scale: a=strong positive, b=solid positive, c=mixed/partial, d=negative, e=can't speak to this.
- Don't infer beyond the text. If the reference doesn't mention something, don't include it as a theme.`;

interface YearVerificationContext {
  applicantStatedStartYear: number | null;
  applicantYearUnknown: boolean;
  referenceConfirmedStartYear: number | null;
  yearCantRecall: boolean;
  /** Computed bucket: matches / close / disagrees / cant_recall, or null when
   *  no verification was asked (applicant_year_unknown). */
  verification: "matches" | "close" | "disagrees" | "cant_recall" | null;
  /** Absolute difference when both years are present; null otherwise. */
  yearGap: number | null;
}

function computeYearVerification(
  applicantStatedStartYear: number | null,
  applicantYearUnknown: boolean,
  rawConfirmedYear: unknown,
  yearCantRecall: boolean,
): { ok: true; ctx: YearVerificationContext } | { ok: false; error: string } {
  // No verification asked when the applicant didn't provide a year.
  if (applicantYearUnknown || applicantStatedStartYear == null) {
    return {
      ok: true,
      ctx: {
        applicantStatedStartYear,
        applicantYearUnknown,
        referenceConfirmedStartYear: null,
        yearCantRecall: false,
        verification: null,
        yearGap: null,
      },
    };
  }
  if (yearCantRecall) {
    return {
      ok: true,
      ctx: {
        applicantStatedStartYear,
        applicantYearUnknown,
        referenceConfirmedStartYear: null,
        yearCantRecall: true,
        verification: "cant_recall",
        yearGap: null,
      },
    };
  }
  let refYear: number | null = null;
  if (rawConfirmedYear != null && rawConfirmedYear !== "") {
    const n = typeof rawConfirmedYear === "number"
      ? rawConfirmedYear
      : Number.parseInt(String(rawConfirmedYear), 10);
    if (!Number.isInteger(n)) {
      return { ok: false, error: "confirmedStartYear must be an integer" };
    }
    const maxYear = new Date().getUTCFullYear() + 1;
    if (n < 1980 || n > maxYear) {
      return { ok: false, error: `confirmedStartYear must be between 1980 and ${maxYear}` };
    }
    refYear = n;
  }
  if (refYear == null) {
    // Reference didn't pick can't-recall but also didn't provide a year.
    // Treat as cant_recall (degenerate case from older clients).
    return {
      ok: true,
      ctx: {
        applicantStatedStartYear,
        applicantYearUnknown,
        referenceConfirmedStartYear: null,
        yearCantRecall: true,
        verification: "cant_recall",
        yearGap: null,
      },
    };
  }
  const gap = Math.abs(refYear - applicantStatedStartYear);
  const verification: "matches" | "close" | "disagrees" =
    gap <= 1 ? "matches" : gap <= 3 ? "close" : "disagrees";
  return {
    ok: true,
    ctx: {
      applicantStatedStartYear,
      applicantYearUnknown,
      referenceConfirmedStartYear: refYear,
      yearCantRecall: false,
      verification,
      yearGap: gap,
    },
  };
}

const DOMAIN_CODES_FB = new Set<string>([
  "legal",
  "medical_pharma",
  "marketing_transcreation",
  "technical_it",
  "financial_banking",
  "literary_publishing",
  "government_ngo",
  "other",
]);

const DOMAIN_LABEL_FB: Record<string, string> = {
  legal: "Legal",
  medical_pharma: "Medical / Pharmaceutical",
  marketing_transcreation: "Marketing / Transcreation",
  technical_it: "Technical / IT",
  financial_banking: "Financial / Banking",
  literary_publishing: "Literary / Publishing",
  government_ngo: "Government / NGO",
  other: "Other",
};

interface DomainVerificationContext {
  applicantStatedDomains: string[] | null;
  applicantOtherDomainText: string | null;
  applicantDomainsUnknown: boolean;
  referenceConfirmedDomains: string[];
  referenceOtherDomainText: string | null;
  domainsCantRecall: boolean;
  /** Computed bucket: matches / partial / disjoint / cant_recall, or null
   *  when no verification was asked (applicant_domains_unknown). */
  verification: "matches" | "partial" | "disjoint" | "cant_recall" | null;
}

function computeDomainVerification(
  applicantStatedDomains: string[] | null,
  applicantOtherDomainText: string | null,
  applicantDomainsUnknown: boolean,
  rawConfirmedDomains: unknown,
  rawConfirmedOtherText: unknown,
  domainsCantRecall: boolean,
): { ok: true; ctx: DomainVerificationContext } | { ok: false; error: string } {
  if (rawConfirmedDomains != null && !Array.isArray(rawConfirmedDomains)) {
    return { ok: false, error: "confirmedDomains must be an array" };
  }
  if (domainsCantRecall) {
    return {
      ok: true,
      ctx: {
        applicantStatedDomains,
        applicantOtherDomainText,
        applicantDomainsUnknown,
        referenceConfirmedDomains: [],
        referenceOtherDomainText: null,
        domainsCantRecall: true,
        verification: "cant_recall",
      },
    };
  }
  const confirmed = new Set<string>();
  const hasApplicantAnchor =
    !applicantDomainsUnknown &&
    applicantStatedDomains != null &&
    applicantStatedDomains.length > 0;
  for (const d of (rawConfirmedDomains ?? []) as unknown[]) {
    if (typeof d !== "string") return { ok: false, error: "confirmedDomains entries must be strings" };
    const code = d.trim().toLowerCase();
    if (!DOMAIN_CODES_FB.has(code)) return { ok: false, error: `invalid domain: ${code}` };
    // When applicant declared, restrict to that set (verification anchor).
    // When applicant didn't declare, accept any code — reference's self-
    // volunteered domain experience still useful even without verification.
    if (!hasApplicantAnchor || applicantStatedDomains!.includes(code)) {
      confirmed.add(code);
    }
  }
  const otherText = confirmed.has("other") && typeof rawConfirmedOtherText === "string"
    ? rawConfirmedOtherText.trim().slice(0, 200) || null
    : null;
  const confirmedArr = Array.from(confirmed).sort();

  // verification: only computed when applicant anchored.
  let verification: "matches" | "partial" | "disjoint" | null = null;
  if (hasApplicantAnchor) {
    const applicantSet = new Set(applicantStatedDomains!);
    if (confirmedArr.length === 0) {
      verification = "disjoint";
    } else if (
      confirmedArr.length === applicantSet.size &&
      confirmedArr.every((c) => applicantSet.has(c))
    ) {
      verification = "matches";
    } else {
      verification = "partial";
    }
  }

  return {
    ok: true,
    ctx: {
      applicantStatedDomains,
      applicantOtherDomainText,
      applicantDomainsUnknown,
      referenceConfirmedDomains: confirmedArr,
      referenceOtherDomainText: otherText,
      domainsCantRecall: false,
      verification,
    },
  };
}

async function analyseWithOpus(args: {
  applicantName: string;
  referenceName: string;
  referenceCompany: string | null;
  referenceRelationship: string | null;
  feedbackText: string;
  feedbackRating: number | null;
  yearVerification: YearVerificationContext;
  domainVerification: DomainVerificationContext;
  competenceResponses: Record<string, unknown>;
}): Promise<{ ok: boolean; data: Record<string, unknown> | null; error: string | null }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, data: null, error: "ANTHROPIC_API_KEY not configured" };

  // Build the year-verification block for the AI. When the reference disagrees
  // with the applicant's stated start year by 4+ years, the AI MUST surface it
  // as a red flag — see ANALYSIS_SYSTEM_PROMPT.
  const yv = args.yearVerification;
  let yearVerificationLine = "Year verification: (applicant did not provide a year, so no verification was asked)";
  if (!yv.applicantYearUnknown && yv.applicantStatedStartYear != null) {
    if (yv.verification === "cant_recall") {
      yearVerificationLine =
        `Year verification: applicant said they started working with this reference around ${yv.applicantStatedStartYear}; reference said they can't recall the exact year. Weak relationship signal but not a red flag on its own.`;
    } else if (yv.verification === "matches") {
      yearVerificationLine =
        `Year verification: applicant said ~${yv.applicantStatedStartYear}; reference said ${yv.referenceConfirmedStartYear} (within ${yv.yearGap} year${yv.yearGap === 1 ? "" : "s"}). MATCHES — corroborates the working relationship.`;
    } else if (yv.verification === "close") {
      yearVerificationLine =
        `Year verification: applicant said ~${yv.applicantStatedStartYear}; reference said ${yv.referenceConfirmedStartYear} (gap of ${yv.yearGap} years). Close enough to be plausible memory drift.`;
    } else if (yv.verification === "disagrees") {
      yearVerificationLine =
        `Year verification: applicant said ~${yv.applicantStatedStartYear}; reference said ${yv.referenceConfirmedStartYear} (gap of ${yv.yearGap} years). DISAGREES — this is a red flag. Either applicant misremembered substantially, exaggerated tenure, or reference is recalling someone else.`;
    }
  }

  const dv = args.domainVerification;
  const labelDomains = (codes: string[], otherText: string | null) => {
    const parts = codes.map((c) =>
      c === "other" && otherText ? `Other (${otherText})` : (DOMAIN_LABEL_FB[c] ?? c),
    );
    return parts.length > 0 ? parts.join(", ") : "(none)";
  };
  let domainVerificationLine = "Domain verification: (applicant did not declare any domains, so no verification was asked)";
  if (!dv.applicantDomainsUnknown && dv.applicantStatedDomains && dv.applicantStatedDomains.length > 0) {
    const applicantLabel = labelDomains(dv.applicantStatedDomains, dv.applicantOtherDomainText);
    if (dv.verification === "cant_recall") {
      domainVerificationLine =
        `Domain verification: applicant said they worked together on [${applicantLabel}]; reference said they can't recall the domains. Weak signal but not a red flag on its own.`;
    } else if (dv.verification === "matches") {
      domainVerificationLine =
        `Domain verification: applicant said [${applicantLabel}]; reference confirmed exactly the same set. MATCHES — corroborates the claimed expertise.`;
    } else if (dv.verification === "partial") {
      const confirmedLabel = labelDomains(dv.referenceConfirmedDomains, dv.referenceOtherDomainText);
      domainVerificationLine =
        `Domain verification: applicant said [${applicantLabel}]; reference confirmed only [${confirmedLabel}]. PARTIAL — normal pattern where reference only saw some of the applicant's work; not a red flag.`;
    } else if (dv.verification === "disjoint") {
      const extra = dv.referenceOtherDomainText
        ? ` Reference instead said they worked on: "${dv.referenceOtherDomainText}".`
        : "";
      domainVerificationLine =
        `Domain verification: applicant said [${applicantLabel}]; reference confirmed NONE of those domains.${extra} DISJOINT — this is a red flag. Applicant's claimed expertise is not corroborated.`;
    }
  }

  // MCQ summary — flat vs per-domain.
  const cr = args.competenceResponses;
  let mcqBlock: string;
  if (cr.by_domain && typeof cr.by_domain === "object") {
    const byDomain = cr.by_domain as Record<string, Record<string, string>>;
    const lines: string[] = ["MCQ answers (reference answered SEPARATELY for each confirmed domain):"];
    for (const [code, answers] of Object.entries(byDomain)) {
      const label = DOMAIN_LABEL_FB[code] ?? code;
      lines.push(`- ${label}:`);
      for (const slug of REQUIRED_SLUGS) {
        lines.push(`    ${slug}: ${answers[slug]}`);
      }
    }
    mcqBlock = lines.join("\n");
  } else {
    const lines: string[] = ["MCQ answers (single answer set covering all confirmed domains):"];
    for (const slug of REQUIRED_SLUGS) {
      lines.push(`- ${slug}: ${cr[slug] ?? "?"}`);
    }
    mcqBlock = lines.join("\n");
  }
  const wwa = cr.would_work_again ?? "(not given)";

  const userMessage = `Applicant: ${args.applicantName}
Reference: ${args.referenceName} (${args.referenceCompany ?? "company unspecified"} — ${args.referenceRelationship ?? "relationship unspecified"})
Reference's overall rating: ${args.feedbackRating ?? "not given"} / 5
Would work with applicant again: ${wwa}
${yearVerificationLine}
${domainVerificationLine}

${mcqBlock}

Reference's free-text response:
---
${args.feedbackText}
---

Output the analysis JSON now.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_QUALITY,
        max_tokens: 800,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, data: null, error: `${resp.status}: ${body.slice(0, 400)}` };
    }
    const data = (await resp.json()) as { content: { type: string; text?: string }[] };
    const raw =
      (data.content ?? []).find((c) => c.type === "text")?.text?.trim() ?? "";
    // Strip optional code fences.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      return { ok: true, data: parsed, error: null };
    } catch {
      return { ok: false, data: null, error: `JSON parse failed: ${cleaned.slice(0, 200)}` };
    }
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: {
    feedbackToken?: string;
    action?: "submit" | "decline";
    validateOnly?: boolean;
    feedbackText?: string | null;
    feedbackRating?: number;
    reason?: string;
    competenceResponses?: Record<string, unknown>;
    /** Year the reference says they started working with the applicant.
     *  Optional — reference may pick "can't recall" instead via
     *  yearCantRecall. Ignored when applicant_year_unknown=true on the row
     *  (no verification was asked). */
    confirmedStartYear?: number | string | null;
    /** True when reference picked "I can't recall the year". */
    yearCantRecall?: boolean;
    /** Domain codes the reference confirmed (subset of applicant_stated_domains).
     *  Ignored when applicant didn't declare domains. */
    confirmedDomains?: string[];
    /** Reference's free-text "we worked on something else" entry. */
    confirmedOtherDomainText?: string | null;
    /** True when reference picked "I can't recall the domains". */
    domainsCantRecall?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.feedbackToken) {
    return json({ success: false, error: "feedbackToken_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: refRow } = await supabase
    .from("cvp_application_references")
    .select(
      "id, application_id, reference_name, reference_email, reference_company, reference_relationship, feedback_token_expires_at, status, applicant_stated_start_year, applicant_year_unknown, applicant_stated_domains, applicant_other_domain_text, applicant_domains_unknown",
    )
    .eq("feedback_token", body.feedbackToken)
    .maybeSingle();
  if (!refRow) return json({ success: false, error: "invalid_token" }, 404);
  if (new Date(refRow.feedback_token_expires_at).getTime() < Date.now()) {
    return json({ success: false, error: "token_expired" }, 410);
  }

  const { data: app } = await supabase
    .from("cvp_applications")
    .select("id, full_name, application_number")
    .eq("id", refRow.application_id)
    .single();
  if (!app) return json({ success: false, error: "application_not_found" }, 404);

  // ---- Validation-only ----
  if (body.validateOnly || !body.action) {
    return json({
      success: true,
      data: {
        referenceName: refRow.reference_name,
        applicantName: app.full_name,
        applicationNumber: app.application_number,
        alreadySubmitted: refRow.status === "received" || refRow.status === "declined",
        previousStatus: refRow.status,
        // Year-verification context.
        applicantStatedStartYear: refRow.applicant_stated_start_year as number | null,
        applicantYearUnknown: refRow.applicant_year_unknown as boolean,
        // Domain-verification context. When applicantStatedDomains is non-empty
        // (or applicantDomainsUnknown=false but the array is null = legacy row),
        // the questionnaire shows confirmation checkboxes. When applicant said
        // "I don't remember", the questionnaire falls back to the legacy single
        // domain_specialty dropdown inside the MCQ form.
        applicantStatedDomains: (refRow.applicant_stated_domains as string[] | null) ?? null,
        applicantOtherDomainText: (refRow.applicant_other_domain_text as string | null) ?? null,
        applicantDomainsUnknown: refRow.applicant_domains_unknown as boolean,
      },
    });
  }

  if (refRow.status === "received" || refRow.status === "declined") {
    return json({ success: false, error: "already_submitted" }, 409);
  }

  // ---- Decline ----
  if (body.action === "decline") {
    await supabase
      .from("cvp_application_references")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        decline_reason: (body.reason ?? "").trim() || null,
      })
      .eq("id", refRow.id);
    return json({ success: true, data: { declined: true } });
  }

  // ---- Submit ----
  if (body.action !== "submit") {
    return json({ success: false, error: "unknown_action" }, 400);
  }
  const feedbackText = (body.feedbackText ?? "").trim();
  const rating =
    typeof body.feedbackRating === "number" &&
    body.feedbackRating >= 1 &&
    body.feedbackRating <= 5
      ? body.feedbackRating
      : null;

  // Phase 5a — competence_responses is now the primary signal. Free
  // text is optional; MCQ payload is required.
  const competence = validateCompetenceResponses(body.competenceResponses);
  if (!competence.ok) {
    return json(
      { success: false, error: "competence_invalid", detail: competence.error },
      400,
    );
  }

  // Year verification (2026-05-19). Computes the matches/close/disagrees
  // bucket from the applicant's stated year (set when contacts were
  // submitted) and the reference's confirmed year here.
  const yv = computeYearVerification(
    refRow.applicant_stated_start_year as number | null,
    (refRow.applicant_year_unknown as boolean) ?? false,
    body.confirmedStartYear ?? null,
    body.yearCantRecall === true,
  );
  if (!yv.ok) {
    return json(
      { success: false, error: "invalid_confirmed_start_year", detail: yv.error },
      400,
    );
  }

  // Domain verification (2026-05-19). Computes matches/partial/disjoint
  // from the applicant's declared domains and the reference's confirmation.
  const dv = computeDomainVerification(
    (refRow.applicant_stated_domains as string[] | null) ?? null,
    (refRow.applicant_other_domain_text as string | null) ?? null,
    (refRow.applicant_domains_unknown as boolean) ?? false,
    body.confirmedDomains ?? null,
    body.confirmedOtherDomainText ?? null,
    body.domainsCantRecall === true,
  );
  if (!dv.ok) {
    return json(
      { success: false, error: "invalid_confirmed_domains", detail: dv.error },
      400,
    );
  }

  // Persist immediately; AI runs after so a slow / failing AI doesn't
  // make the reference think their submission failed.
  await supabase
    .from("cvp_application_references")
    .update({
      status: "received",
      feedback_text: feedbackText || null,
      feedback_rating: rating,
      competence_responses: competence.data,
      reference_confirmed_start_year: yv.ctx.referenceConfirmedStartYear,
      year_verification: yv.ctx.verification,
      reference_confirmed_domains: dv.ctx.referenceConfirmedDomains.length > 0
        ? dv.ctx.referenceConfirmedDomains
        : null,
      reference_other_domain_text: dv.ctx.referenceOtherDomainText,
      domain_verification: dv.ctx.verification,
      feedback_received_at: new Date().toISOString(),
    })
    .eq("id", refRow.id);

  // V20 ack to the reference.
  const ackTpl = buildV20ReferenceAck({
    referenceName: refRow.reference_name,
    applicantName: app.full_name,
  });
  await sendMailgunEmail({
    to: { email: refRow.reference_email, name: refRow.reference_name },
    subject: ackTpl.subject,
    html: ackTpl.html,
    text: ackTpl.text,
    tags: ["v20-reference-ack", String(refRow.application_id)],
    trackContext: {
      applicationId: String(refRow.application_id),
      templateTag: "v20-reference-ack",
    },
  });

  // Run Opus analysis (best-effort; AI fallback rule applies).
  const analysis = await analyseWithOpus({
    applicantName: app.full_name,
    referenceName: refRow.reference_name,
    referenceCompany: refRow.reference_company,
    referenceRelationship: refRow.reference_relationship,
    feedbackText,
    feedbackRating: rating,
    yearVerification: yv.ctx,
    domainVerification: dv.ctx,
    competenceResponses: competence.data,
  });
  if (analysis.ok && analysis.data) {
    await supabase
      .from("cvp_application_references")
      .update({
        ai_analysis: analysis.data,
        ai_analysis_at: new Date().toISOString(),
        ai_analysis_error: null,
      })
      .eq("id", refRow.id);
  } else {
    await supabase
      .from("cvp_application_references")
      .update({
        ai_analysis_error: analysis.error,
        ai_analysis_at: new Date().toISOString(),
      })
      .eq("id", refRow.id);
  }

  return json({
    success: true,
    data: {
      received: true,
      aiAnalysed: analysis.ok,
      yearVerification: yv.ctx.verification,
      yearGap: yv.ctx.yearGap,
      domainVerification: dv.ctx.verification,
    },
  });
});

// Inline MCQ validator — mirrors apps/recruitment/src/data/referenceMcqs.ts.
// Accepts two shapes:
//   1) Flat (legacy / single-mode): all 6 slugs at top level.
//   2) Per-domain (PR #188): { would_work_again, by_domain: { <code>: {...6 slugs} } }
const REQUIRED_SLUGS = [
  "translation_competence",
  "linguistic_textual_competence",
  "research_competence",
  "cultural_competence",
  "technical_competence",
  "domain_competence",
];
const VALID_MCQ_VALUES = new Set(["a", "b", "c", "d", "e"]);
const VALID_WWA = new Set(["yes", "probably", "probably_not", "no"]);

function validateMcqAnswerSet(
  obj: Record<string, unknown>,
  domainLabel: string | null,
): { ok: true; out: Record<string, string> } | { ok: false; error: string } {
  const out: Record<string, string> = {};
  for (const slug of REQUIRED_SLUGS) {
    const v = obj[slug];
    if (typeof v !== "string" || !VALID_MCQ_VALUES.has(v)) {
      const prefix = domainLabel ? `for domain "${domainLabel}", ` : "";
      return { ok: false, error: `${prefix}missing or invalid: ${slug}` };
    }
    out[slug] = v;
  }
  return { ok: true, out };
}

function validateCompetenceResponses(input: unknown):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "missing" };
  const obj = input as Record<string, unknown>;
  if (!VALID_WWA.has(obj.would_work_again as string)) {
    return { ok: false, error: "missing or invalid: would_work_again" };
  }
  if (obj.domain_specialty != null && typeof obj.domain_specialty !== "string") {
    return { ok: false, error: "domain_specialty must be string or null" };
  }

  // Per-domain shape: must contain `by_domain` as a non-empty object whose
  // keys are valid domain codes and values are full MCQ sets.
  if (obj.by_domain != null) {
    if (typeof obj.by_domain !== "object" || Array.isArray(obj.by_domain)) {
      return { ok: false, error: "by_domain must be an object keyed by domain code" };
    }
    const byDomain = obj.by_domain as Record<string, unknown>;
    const codes = Object.keys(byDomain);
    if (codes.length === 0) {
      return { ok: false, error: "by_domain is empty — pick at least one domain or use single-mode" };
    }
    const cleanedByDomain: Record<string, Record<string, string>> = {};
    for (const code of codes) {
      if (!DOMAIN_CODES_FB.has(code)) {
        return { ok: false, error: `by_domain has invalid domain code: ${code}` };
      }
      const dObj = byDomain[code];
      if (!dObj || typeof dObj !== "object") {
        return { ok: false, error: `by_domain.${code} must be an object` };
      }
      const v = validateMcqAnswerSet(dObj as Record<string, unknown>, code);
      if (!v.ok) return v;
      cleanedByDomain[code] = v.out;
    }
    return {
      ok: true,
      data: {
        would_work_again: obj.would_work_again,
        domain_specialty: obj.domain_specialty ? String(obj.domain_specialty).slice(0, 200) : null,
        by_domain: cleanedByDomain,
      },
    };
  }

  // Flat shape (single-mode / legacy).
  const flat = validateMcqAnswerSet(obj, null);
  if (!flat.ok) return flat;
  const data: Record<string, unknown> = {
    would_work_again: obj.would_work_again,
    domain_specialty: obj.domain_specialty ? String(obj.domain_specialty).slice(0, 200) : null,
    ...flat.out,
  };
  return { ok: true, data };
}
