// ============================================================================
// cvp-suggest-vendor-rate v2.0 (hybrid: deterministic baseline + AI reasoning)
//
// Suggests a competitive vendor per-page rate for a given lane.
// Anchored at 20% of the client per-page price (margin-first), then
// modulated by test score, country COL, and experience tier.
//
// Inputs:  { application_id? OR vendor_id?, source_language, target_language,
//            service_id?, calculation_unit? = 'per_page', staff_id?,
//            use_ai_reasoning?: boolean (default true) }
// Output:  { recommended_rate, alternative_higher, alternative_lower,
//            currency, confidence, reasoning, pool_*, client_rate_used,
//            col_bucket, col_multiplier, experience_multiplier, ... }
//
// Policy:
//   client_rate = median(ai_analysis_results.base_rate) for source lang
//                 OR $65 fallback if <5 samples
//   ceiling     = client_rate * 0.20
//   absolute_floor = client_rate * 0.12   ("politeness floor", never insult)
//   combined_factor = test_factor × col_factor × exp_factor   (capped to ceiling)
//
// Country COL bucket multiplier (relative to ceiling):
//   high-income (US, UK, CA, DE, etc.):           1.10x — push closer to ceiling
//   upper-middle income (Brazil, Mexico, etc.):   1.00x
//   lower-middle income (India, Egypt, etc.):     0.92x
//   low income / unknown:                         0.85x
//
// Experience multiplier:
//   10+ years: 1.10x, 6-9: 1.05x, 3-5: 1.00x, 0-2: 0.95x
//
// AI reasoning: Claude (Haiku 4.5) writes the 2-3 sentence rationale staff
// sees in the UI. The number itself is deterministic for ISO auditability —
// Claude never picks the rate, only explains it. If the API call fails,
// falls back to a templated reasoning string.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_CLIENT_RATE_CAD_PER_PAGE = 65;
const MARGIN_MULTIPLIER = 0.20;
const FLOOR_MULTIPLIER = 0.10;
const ANTI_LOWBALL_FLOOR_MULTIPLIER = 0.12; // never recommend below 12% of client rate
const POOL_MIN_SAMPLES = 5;

const PROMPT_VERSION = "hybrid-claude-v2";

// World Bank-style income bucket per ISO-3166 alpha-2 country code. Covers
// the countries our recruiters see most. Anything not listed falls back to
// "low" (most conservative, never insults a high-COL applicant).
const COL_BUCKETS: Record<string, "high" | "upper_mid" | "lower_mid" | "low"> = {
  // High income — Western developed markets
  US: "high", CA: "high", GB: "high", DE: "high", FR: "high", IT: "high",
  ES: "high", NL: "high", BE: "high", CH: "high", AT: "high", IE: "high",
  SE: "high", NO: "high", DK: "high", FI: "high", IS: "high", LU: "high",
  AU: "high", NZ: "high", JP: "high", KR: "high", SG: "high", HK: "high",
  IL: "high", QA: "high", AE: "high", KW: "high", SA: "high",
  PT: "high", GR: "high", CZ: "high", SI: "high", EE: "high", LV: "high",
  LT: "high", PL: "high", SK: "high", HU: "high", HR: "high",
  // Upper-middle income
  MX: "upper_mid", BR: "upper_mid", AR: "upper_mid", CL: "upper_mid",
  UY: "upper_mid", CR: "upper_mid", PA: "upper_mid",
  CN: "upper_mid", MY: "upper_mid", TH: "upper_mid", TR: "upper_mid",
  RU: "upper_mid", RO: "upper_mid", BG: "upper_mid", RS: "upper_mid",
  ZA: "upper_mid", BY: "upper_mid",
  // Lower-middle income
  IN: "lower_mid", PH: "lower_mid", ID: "lower_mid", VN: "lower_mid",
  EG: "lower_mid", MA: "lower_mid", TN: "lower_mid", DZ: "lower_mid",
  NG: "lower_mid", KE: "lower_mid", GH: "lower_mid",
  UA: "lower_mid", UZ: "lower_mid", BO: "lower_mid", HN: "lower_mid",
  PK: "lower_mid", BD: "lower_mid", LK: "lower_mid",
  CO: "lower_mid", PE: "lower_mid", EC: "lower_mid", VE: "lower_mid",
  GT: "lower_mid", SV: "lower_mid", NI: "lower_mid", PY: "lower_mid",
  IR: "lower_mid",
  // Low income
  AF: "low", ET: "low", UG: "low", TZ: "low", RW: "low", MZ: "low",
  HT: "low", YE: "low", SY: "low", SO: "low", SD: "low",
};

const COL_FACTORS: Record<"high" | "upper_mid" | "lower_mid" | "low", number> = {
  high: 1.10,
  upper_mid: 1.00,
  lower_mid: 0.92,
  low: 0.85,
};

const COL_LABELS: Record<"high" | "upper_mid" | "lower_mid" | "low", string> = {
  high: "high cost-of-living",
  upper_mid: "upper-middle cost-of-living",
  lower_mid: "lower-middle cost-of-living",
  low: "low cost-of-living",
};

interface SuggestInput {
  application_id?: string;
  vendor_id?: string;
  source_language: string;
  target_language: string;
  service_id?: string;
  calculation_unit?: string;
  staff_id?: string;
  use_ai_reasoning?: boolean;
}

function bucketFromScore(score: number | null): {
  bucket: string;
  factor: number | null;
} {
  if (score == null) return { bucket: "no_test", factor: 0.70 };
  if (score >= 90) return { bucket: "strong", factor: 0.95 };
  if (score >= 75) return { bucket: "competent", factor: 0.85 };
  if (score >= 60) return { bucket: "borderline", factor: 0.70 };
  return { bucket: "fail", factor: null };
}

function colBucketFor(country: string | null): "high" | "upper_mid" | "lower_mid" | "low" {
  if (!country) return "low";
  // Accept either ISO alpha-2 or a name; map common full names too
  const upper = country.trim().toUpperCase();
  if (COL_BUCKETS[upper]) return COL_BUCKETS[upper];
  // Common full-name fallbacks for the most-seen entries
  const NAME_TO_CODE: Record<string, keyof typeof COL_BUCKETS> = {
    "UNITED STATES": "US", "USA": "US", "AMERICA": "US",
    "UNITED KINGDOM": "GB", "GREAT BRITAIN": "GB", "ENGLAND": "GB",
    "CANADA": "CA", "GERMANY": "DE", "FRANCE": "FR", "SPAIN": "ES",
    "ITALY": "IT", "JAPAN": "JP", "AUSTRALIA": "AU", "INDIA": "IN",
    "PHILIPPINES": "PH", "PAKISTAN": "PK", "CHINA": "CN", "BRAZIL": "BR",
    "MEXICO": "MX", "ARGENTINA": "AR", "EGYPT": "EG", "MOROCCO": "MA",
    "TURKEY": "TR", "RUSSIA": "RU", "UKRAINE": "UA", "NETHERLANDS": "NL",
    "POLAND": "PL", "VIETNAM": "VN", "INDONESIA": "ID", "IRAN": "IR",
    "NIGERIA": "NG", "SOUTH AFRICA": "ZA",
  };
  if (NAME_TO_CODE[upper]) return COL_BUCKETS[NAME_TO_CODE[upper]];
  return "low";
}

function experienceMultiplier(years: number | null): { tier: string; factor: number } {
  if (years == null) return { tier: "unknown", factor: 1.00 };
  if (years >= 10) return { tier: "senior_10+y", factor: 1.10 };
  if (years >= 6) return { tier: "experienced_6-9y", factor: 1.05 };
  if (years >= 3) return { tier: "mid_3-5y", factor: 1.00 };
  return { tier: "junior_0-2y", factor: 0.95 };
}

function roundRate(n: number): number {
  return Math.round(n * 4) / 4;
}

// Claude reasoning helper — never picks the number, only writes prose.
async function generateAiReasoning(params: {
  clientRate: number;
  ceiling: number;
  recommended: number;
  testScore: number | null;
  testBucket: string;
  country: string | null;
  colBucket: string;
  colFactor: number;
  yearsExperience: number | null;
  experienceTier: string;
  experienceFactor: number;
  sourceLang: string;
  targetLang: string;
}): Promise<{ text: string; source: "claude" | "template" }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { text: buildTemplateReasoning(params), source: "template" };

  const prompt = `You are pricing translation services for Cethos. Write a 2-3 sentence rationale (max 60 words) explaining the recommended rate to staff. Be concrete, mention the actual factors, and signal whether this is competitive vs the local market.

Context:
- Language pair: ${params.sourceLang.toUpperCase()} → ${params.targetLang.toUpperCase()}
- Client per-page price (CAD): $${params.clientRate.toFixed(2)}
- Margin ceiling (20% of client): $${params.ceiling.toFixed(2)}
- Vendor profile: ${params.yearsExperience ?? "unknown"} years experience, ${params.country ?? "unknown country"} (${params.colBucket} COL)
- Test score: ${params.testScore ?? "no test"} (${params.testBucket})
- Modifiers applied: test=${params.testBucket}, COL=${params.colFactor.toFixed(2)}x, experience=${params.experienceFactor.toFixed(2)}x
- Recommended rate: CAD $${params.recommended.toFixed(2)}/page

Write the rationale as if speaking to a project manager who needs to decide whether to send this offer. Mention whether the rate is at the high or low end of the ceiling and why. Do not insult the vendor. Output the rationale only, no preamble.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 240,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      console.error(`Claude reasoning failed: ${response.status}`);
      return { text: buildTemplateReasoning(params), source: "template" };
    }
    const data = await response.json();
    const text = (data?.content?.[0]?.text ?? "").trim();
    if (!text) return { text: buildTemplateReasoning(params), source: "template" };
    return { text, source: "claude" };
  } catch (err) {
    console.error("Claude reasoning exception:", err);
    return { text: buildTemplateReasoning(params), source: "template" };
  }
}

function buildTemplateReasoning(params: {
  clientRate: number;
  ceiling: number;
  recommended: number;
  testScore: number | null;
  testBucket: string;
  country: string | null;
  colBucket: string;
  colFactor: number;
  yearsExperience: number | null;
  experienceFactor: number;
  sourceLang: string;
  targetLang: string;
}): string {
  const parts: string[] = [];
  parts.push(
    `Client per-page rate for ${params.sourceLang.toUpperCase()}→${params.targetLang.toUpperCase()}: CAD $${params.clientRate.toFixed(2)}; 20% ceiling: $${params.ceiling.toFixed(2)}.`,
  );
  const factorBits: string[] = [];
  if (params.testScore != null) factorBits.push(`test ${params.testScore}/100 (${params.testBucket})`);
  if (params.country) factorBits.push(`${params.country} (${COL_LABELS[params.colBucket as keyof typeof COL_LABELS] ?? params.colBucket})`);
  if (params.yearsExperience != null) factorBits.push(`${params.yearsExperience}y experience`);
  if (factorBits.length > 0) parts.push(`Modifiers: ${factorBits.join("; ")}.`);
  parts.push(`Recommended CAD $${params.recommended.toFixed(2)}/page — competitive within ceiling.`);
  return parts.join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body: SuggestInput = await req.json();
    const {
      application_id,
      vendor_id,
      source_language,
      target_language,
      service_id,
      calculation_unit = "per_page",
      staff_id,
    } = body;

    if (!source_language || !target_language) {
      return json({ error: "source_language and target_language required" }, 400);
    }
    if (!application_id && !vendor_id) {
      return json({ error: "application_id or vendor_id required" }, 400);
    }
    if (calculation_unit !== "per_page") {
      return json({
        error: "Only per_page calculation_unit is supported in v1",
      }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. Pull client-rate pool stats for this source language ──
    // base_rate is the canonical per-page client price (set by quote pricing
    // engine). We anchor on the median of completed, non-excluded rows for
    // the same source language.
    const srcLower = source_language.toLowerCase();
    const { data: poolRows } = await sb
      .from("ai_analysis_results")
      .select("base_rate")
      .eq("calculation_unit", "per_page")
      .eq("processing_status", "completed")
      .neq("is_excluded", true)
      .is("deleted_at", null)
      .ilike("detected_language", srcLower)
      .gt("base_rate", 0);

    const poolRates = (poolRows || [])
      .map((r: any) => Number(r.base_rate))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    let clientRate: number;
    let clientRateSource: string;
    let poolStats: { p25: number | null; median: number | null; p75: number | null; n: number };

    if (poolRates.length >= POOL_MIN_SAMPLES) {
      clientRate = poolRates[Math.floor(poolRates.length * 0.5)];
      clientRateSource = `pool_median_n${poolRates.length}`;
      poolStats = {
        p25: poolRates[Math.floor(poolRates.length * 0.25)],
        median: clientRate,
        p75: poolRates[Math.floor(poolRates.length * 0.75)],
        n: poolRates.length,
      };
    } else {
      clientRate = FALLBACK_CLIENT_RATE_CAD_PER_PAGE;
      clientRateSource = `fallback_default_n${poolRates.length}`;
      poolStats = {
        p25: poolRates[0] ?? null,
        median: poolRates[Math.floor(poolRates.length / 2)] ?? null,
        p75: poolRates[poolRates.length - 1] ?? null,
        n: poolRates.length,
      };
    }

    // ── 2. Pull applicant profile (years_experience, country, etc.) ──
    let profile: any = null;
    if (application_id) {
      const { data } = await sb
        .from("cvp_applications")
        .select(
          "id, full_name, country, years_experience, education_level, certifications, ai_prescreening_score, assigned_tier",
        )
        .eq("id", application_id)
        .maybeSingle();
      profile = data;
    } else if (vendor_id) {
      const { data } = await sb
        .from("vendors")
        .select("id, full_name, country, years_experience")
        .eq("id", vendor_id)
        .maybeSingle();
      profile = data;
    }

    // ── 3. Pull best test score for this lane ──
    // cvp_test_submissions.ai_assessment_score (0-100). Pick the best score
    // across all submissions for the matching language combination.
    let testScore: number | null = null;
    if (application_id) {
      // Resolve source/target lang ISO codes → language UUIDs to filter
      // cvp_test_combinations.
      const { data: combos } = await sb
        .from("cvp_test_combinations")
        .select(
          "id, source_language_id, target_language_id, source_language:languages!source_language_id(iso_code), target_language:languages!target_language_id(iso_code)",
        )
        .eq("application_id", application_id);

      const matchedCombo = (combos || []).find((c: any) => {
        const src = (c.source_language?.iso_code || "").toLowerCase();
        const tgt = (c.target_language?.iso_code || "").toLowerCase();
        return src === srcLower && tgt === target_language.toLowerCase();
      });

      if (matchedCombo) {
        const { data: subs } = await sb
          .from("cvp_test_submissions")
          .select("ai_assessment_score")
          .eq("combination_id", matchedCombo.id)
          .not("ai_assessment_score", "is", null)
          .order("ai_assessment_score", { ascending: false })
          .limit(1);
        if (subs?.[0]?.ai_assessment_score != null) {
          testScore = Number(subs[0].ai_assessment_score);
        }
      }
    }

    // ── 4. Apply the policy ──
    const ceiling = clientRate * MARGIN_MULTIPLIER;
    const floor = clientRate * FLOOR_MULTIPLIER;
    const antiLowballFloor = clientRate * ANTI_LOWBALL_FLOOR_MULTIPLIER;
    const { bucket: testBucket, factor: testFactor } = bucketFromScore(testScore);

    if (testFactor == null) {
      return json({
        success: false,
        do_not_hire: true,
        reason: `Test score ${testScore} is below 60 — recommendation: do not hire on this lane`,
        test_score_used: testScore,
        test_bucket: testBucket,
        client_rate_used: clientRate,
      }, 200);
    }

    const country: string | null = profile?.country ?? null;
    const yearsExperience: number | null = profile?.years_experience ?? null;
    const colBucket = colBucketFor(country);
    const colFactor = COL_FACTORS[colBucket];
    const { tier: experienceTier, factor: experienceFactor } = experienceMultiplier(yearsExperience);

    // Combined factor — clamped so it can't exceed the ceiling (1.0) but can
    // pull a strong applicant up from the test-bucket baseline.
    const combinedFactor = Math.min(1.0, testFactor * colFactor * experienceFactor);

    let recommended = roundRate(combinedFactor * ceiling);
    if (recommended > ceiling) recommended = roundRate(ceiling);
    // Politeness floor: never go below 12% of client rate even for low-COL
    // junior applicants with mediocre tests. Won't insult.
    if (recommended < antiLowballFloor) recommended = roundRate(antiLowballFloor);

    let altHigher = roundRate(Math.min(recommended * 1.15, ceiling));
    let altLower = roundRate(Math.max(recommended * 0.85, antiLowballFloor));
    if (altHigher === recommended) altHigher = roundRate(ceiling);
    if (altLower === recommended) altLower = roundRate(antiLowballFloor);

    // ── 5. Reasoning (Claude — falls back to template) ──
    const useAi = body.use_ai_reasoning !== false;
    const reasoningResult = useAi
      ? await generateAiReasoning({
          clientRate,
          ceiling,
          recommended,
          testScore,
          testBucket,
          country,
          colBucket,
          colFactor,
          yearsExperience,
          experienceTier,
          experienceFactor,
          sourceLang: source_language,
          targetLang: target_language,
        })
      : {
          text: buildTemplateReasoning({
            clientRate, ceiling, recommended, testScore, testBucket,
            country, colBucket, colFactor, yearsExperience,
            experienceFactor, sourceLang: source_language, targetLang: target_language,
          }),
          source: "template" as const,
        };

    // ── 6. Audit row ──
    const { data: insertedSuggestion } = await sb
      .from("vendor_rate_suggestions")
      .insert({
        vendor_id: vendor_id || null,
        application_id: application_id || null,
        source_language: source_language.toLowerCase(),
        target_language: target_language.toLowerCase(),
        service_id: service_id || null,
        calculation_unit,
        recommended_rate: recommended,
        currency: "CAD",
        alternative_higher: altHigher,
        alternative_lower: altLower,
        confidence: testScore != null ? 0.85 : 0.55,
        ai_reasoning: reasoningResult.text,
        ai_reasoning_source: reasoningResult.source,
        client_rate_used: clientRate,
        client_rate_source: clientRateSource,
        pool_p25: poolStats.p25,
        pool_median: poolStats.median,
        pool_p75: poolStats.p75,
        pool_n: poolStats.n,
        margin_multiplier: MARGIN_MULTIPLIER,
        test_score_used: testScore,
        test_bucket: testBucket,
        country,
        col_bucket: colBucket,
        col_multiplier: colFactor,
        years_experience: yearsExperience,
        experience_multiplier: experienceFactor,
        model_version: reasoningResult.source === "claude" ? "claude-haiku-4-5-20251001" : null,
        prompt_version: PROMPT_VERSION,
        created_by_staff_id: staff_id || null,
      })
      .select("id")
      .single();

    return json({
      success: true,
      suggestion_id: insertedSuggestion?.id ?? null,
      recommended_rate: recommended,
      alternative_higher: altHigher,
      alternative_lower: altLower,
      currency: "CAD",
      calculation_unit,
      confidence: testScore != null ? 0.85 : 0.55,
      reasoning: reasoningResult.text,
      reasoning_source: reasoningResult.source,
      client_rate_used: clientRate,
      client_rate_source: clientRateSource,
      ceiling,
      floor: antiLowballFloor,
      pool: poolStats,
      test_score_used: testScore,
      test_bucket: testBucket,
      country,
      col_bucket: colBucket,
      col_multiplier: colFactor,
      years_experience: yearsExperience,
      experience_multiplier: experienceFactor,
    });
  } catch (err: any) {
    console.error("cvp-suggest-vendor-rate error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
