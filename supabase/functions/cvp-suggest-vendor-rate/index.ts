// ============================================================================
// cvp-suggest-vendor-rate v1.0
// Suggests a competitive vendor per-page rate for a given lane, anchored at
// 30% of the client per-page price (Option A — margin-first policy).
//
// Inputs:  { application_id? OR vendor_id?, source_language, target_language,
//            service_id?, calculation_unit? = 'per_page', staff_id? }
// Output:  { recommended_rate, alternative_higher, alternative_lower,
//            currency, confidence, reasoning, pool_*, client_rate_used, ... }
//
// Policy (deterministic v1, no Claude call):
//   client_rate = median(ai_analysis_results.base_rate) for source lang
//                 OR $65 fallback if <5 samples
//   ceiling     = client_rate * 0.30
//   floor       = client_rate * 0.15
//   bucket = test_score >= 90 → 95% of ceiling
//            test_score 75-89 → 85%
//            test_score 60-74 → 70%
//            test_score  < 60 → "do not hire" (no rate returned)
//   recommended_rate = clamp(bucket_factor * ceiling, floor, ceiling)
//
// Per-word lanes are skipped in v1 (sample too thin; legacy target-mode noise).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_CLIENT_RATE_CAD_PER_PAGE = 65;
const MARGIN_MULTIPLIER = 0.30;
const FLOOR_MULTIPLIER = 0.15;
const POOL_MIN_SAMPLES = 5;

const PROMPT_VERSION = "deterministic-v1";

interface SuggestInput {
  application_id?: string;
  vendor_id?: string;
  source_language: string;
  target_language: string;
  service_id?: string;
  calculation_unit?: string;
  staff_id?: string;
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

function roundRate(n: number): number {
  // Round to nearest $0.25 for tidy display
  return Math.round(n * 4) / 4;
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
    const { bucket, factor } = bucketFromScore(testScore);

    if (factor == null) {
      // Test score below 60 → no rate suggestion
      return json({
        success: false,
        do_not_hire: true,
        reason: `Test score ${testScore} is below 60 — recommendation: do not hire on this lane`,
        test_score_used: testScore,
        test_bucket: bucket,
        client_rate_used: clientRate,
      }, 200);
    }

    let recommended = roundRate(factor * ceiling);
    if (recommended > ceiling) recommended = roundRate(ceiling);
    if (recommended < floor) recommended = roundRate(floor);

    // Alternatives at ±15% of recommended, clamped to ceiling/floor
    let altHigher = roundRate(Math.min(recommended * 1.15, ceiling));
    let altLower = roundRate(Math.max(recommended * 0.85, floor));
    if (altHigher === recommended) altHigher = roundRate(ceiling);
    if (altLower === recommended) altLower = roundRate(floor);

    // ── 5. Build reasoning string ──
    const reasoning = [
      `Client per-page rate for ${source_language.toUpperCase()} → ${target_language.toUpperCase()}: CAD $${clientRate.toFixed(2)} (${clientRateSource}).`,
      `Margin policy: vendor cap = 30% of client = CAD $${ceiling.toFixed(2)}.`,
      testScore != null
        ? `Test score ${testScore}/100 (${bucket}) → suggested ${Math.round(factor * 100)}% of ceiling.`
        : `No test score on this lane → defaulting to 70% of ceiling (conservative).`,
      profile?.years_experience
        ? `Applicant: ${profile.years_experience}y experience${profile.country ? `, ${profile.country}` : ""}.`
        : "",
      `Recommended: CAD $${recommended.toFixed(2)}/page (floor CAD $${floor.toFixed(2)}).`,
    ].filter(Boolean).join(" ");

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
        ai_reasoning: reasoning,
        client_rate_used: clientRate,
        client_rate_source: clientRateSource,
        pool_p25: poolStats.p25,
        pool_median: poolStats.median,
        pool_p75: poolStats.p75,
        pool_n: poolStats.n,
        margin_multiplier: MARGIN_MULTIPLIER,
        test_score_used: testScore,
        test_bucket: bucket,
        model_version: null,
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
      reasoning,
      client_rate_used: clientRate,
      client_rate_source: clientRateSource,
      ceiling,
      floor,
      pool: poolStats,
      test_score_used: testScore,
      test_bucket: bucket,
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
