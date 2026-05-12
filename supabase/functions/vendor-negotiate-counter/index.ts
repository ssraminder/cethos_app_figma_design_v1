// ============================================================================
// vendor-negotiate-counter v1.0 — HITL Phase 1
//
// Reads a vendor's counter-offer, builds a full negotiation context,
// asks Claude to recommend an action (accept / reject / counter / escalate)
// with data-backed reasoning, and writes a vendor_negotiation_decisions row.
//
// In HITL mode (default) the recommendation surfaces in the admin UI for
// staff approval. Auto mode (Phase 2) is wired but disabled until staff
// opts in via negotiation_settings.mode.
//
// Counter tactic: AGGRESSIVE — anchor counter-back at ~30% of the way from
// vendor's counter back toward our original, never higher. Cite specific
// data: pool stats, vendor history, COL bucket, client rate.
//
// Inputs:  { offer_id, staff_id?, trigger_event? = 'vendor_countered' }
// Output:  { decision_id, action, proposed_rate?, proposed_total?,
//            proposed_deadline?, reasoning, confidence, concerns,
//            data_references, mode_used, auto_executed? }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT_VERSION = "negotiator-aggressive-v1";
const MODEL = "claude-opus-4-7";

// COL buckets — duplicated from cvp-suggest-vendor-rate for self-containment.
const COL_BUCKETS: Record<string, "high" | "upper_mid" | "lower_mid" | "low"> = {
  US: "high", CA: "high", GB: "high", DE: "high", FR: "high", IT: "high",
  ES: "high", NL: "high", BE: "high", CH: "high", AT: "high", IE: "high",
  SE: "high", NO: "high", DK: "high", FI: "high", AU: "high", NZ: "high",
  JP: "high", KR: "high", SG: "high", HK: "high", IL: "high", AE: "high",
  MX: "upper_mid", BR: "upper_mid", AR: "upper_mid", CL: "upper_mid",
  CN: "upper_mid", MY: "upper_mid", TH: "upper_mid", TR: "upper_mid",
  RU: "upper_mid", RO: "upper_mid", BG: "upper_mid", ZA: "upper_mid",
  IN: "lower_mid", PH: "lower_mid", ID: "lower_mid", VN: "lower_mid",
  EG: "lower_mid", MA: "lower_mid", NG: "lower_mid", PK: "lower_mid",
  BD: "lower_mid", UA: "lower_mid", CO: "lower_mid", PE: "lower_mid",
  AF: "low", ET: "low", UG: "low", HT: "low", YE: "low",
};

function colBucketFor(country: string | null): string {
  if (!country) return "low";
  const upper = country.trim().toUpperCase();
  return COL_BUCKETS[upper] || "low";
}

const FALLBACK_CLIENT_RATE_CAD_PER_PAGE = 65;
const MARGIN_MULTIPLIER = 0.20;
const ANTI_LOWBALL_FLOOR_MULTIPLIER = 0.12;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { offer_id, staff_id, trigger_event = "vendor_countered" } = body;
    if (!offer_id) return json({ error: "offer_id required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. Load the offer + step + vendor + step's lane ────────────────
    const { data: offer, error: offerErr } = await sb
      .from("vendor_step_offers")
      .select(
        "id, step_id, vendor_id, status, counter_status, vendor_rate, vendor_rate_unit, vendor_total, vendor_currency, deadline, counter_rate, counter_rate_unit, counter_total, counter_deadline, counter_note, counter_at, negotiation_allowed, max_rate, max_total, latest_deadline",
      )
      .eq("id", offer_id)
      .maybeSingle();
    if (offerErr || !offer) return json({ error: "offer not found" }, 404);
    if (offer.counter_status !== "proposed") {
      return json({
        error: "offer is not in 'proposed' counter state",
        counter_status: offer.counter_status,
      }, 400);
    }

    const { data: step } = await sb
      .from("order_workflow_steps")
      .select("id, name, order_id, source_language, target_language, service_id")
      .eq("id", offer.step_id)
      .maybeSingle();
    if (!step) return json({ error: "step not found" }, 404);

    const { data: vendor } = await sb
      .from("vendors")
      .select("id, full_name, country, years_experience, application_id")
      .eq("id", offer.vendor_id)
      .maybeSingle();

    // Resolve language ISO codes for source/target
    const langIds = [step.source_language, step.target_language].filter(Boolean);
    let srcCode = "?", tgtCode = "?";
    if (langIds.length > 0) {
      const { data: langs } = await sb
        .from("languages")
        .select("id, iso_code")
        .in("id", langIds);
      const map = new Map((langs || []).map((l: any) => [l.id, (l.iso_code || "").toLowerCase()]));
      srcCode = map.get(step.source_language) || "?";
      tgtCode = map.get(step.target_language) || "?";
    }

    // ── 2. Client per-page rate for this lane ──────────────────────────
    const { data: poolRows } = await sb
      .from("ai_analysis_results")
      .select("base_rate")
      .eq("calculation_unit", "per_page")
      .eq("processing_status", "completed")
      .neq("is_excluded", true)
      .is("deleted_at", null)
      .ilike("detected_language", srcCode)
      .gt("base_rate", 0);

    const poolRates = (poolRows || [])
      .map((r: any) => Number(r.base_rate))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    let clientRate = FALLBACK_CLIENT_RATE_CAD_PER_PAGE;
    let poolP25: number | null = null, poolMedian: number | null = null, poolP75: number | null = null;
    if (poolRates.length >= 5) {
      poolP25 = poolRates[Math.floor(poolRates.length * 0.25)];
      poolMedian = poolRates[Math.floor(poolRates.length * 0.5)];
      poolP75 = poolRates[Math.floor(poolRates.length * 0.75)];
      clientRate = poolMedian;
    }
    const ceiling = clientRate * MARGIN_MULTIPLIER;
    const antiLowballFloor = clientRate * ANTI_LOWBALL_FLOOR_MULTIPLIER;

    // ── 3. Vendor history — past job count, completion rate, quality ──
    let historyJobs = 0;
    let historyAcceptRate: number | null = null;
    let historyAvgQuality: number | null = null;
    if (offer.vendor_id) {
      const { data: pastOffers } = await sb
        .from("vendor_step_offers")
        .select("status")
        .eq("vendor_id", offer.vendor_id)
        .neq("id", offer_id)
        .in("status", ["accepted", "declined", "expired"]);
      const total = (pastOffers || []).length;
      if (total > 0) {
        const accepted = (pastOffers || []).filter((o: any) => o.status === "accepted").length;
        historyAcceptRate = accepted / total;
      }
      const { count: completedCount } = await sb
        .from("order_workflow_steps")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", offer.vendor_id)
        .in("status", ["approved", "completed"]);
      historyJobs = completedCount || 0;
    }

    // Vendor test score on this lane (if applicant)
    let testScore: number | null = null;
    if (vendor?.application_id) {
      const { data: combos } = await sb
        .from("cvp_test_combinations")
        .select("id, source_language:languages!source_language_id(iso_code), target_language:languages!target_language_id(iso_code)")
        .eq("application_id", vendor.application_id);
      const match = (combos || []).find((c: any) => {
        const s = (c.source_language?.iso_code || "").toLowerCase();
        const t = (c.target_language?.iso_code || "").toLowerCase();
        return s === srcCode && t === tgtCode;
      });
      if (match) {
        const { data: subs } = await sb
          .from("cvp_test_submissions")
          .select("ai_assessment_score")
          .eq("combination_id", match.id)
          .not("ai_assessment_score", "is", null)
          .order("ai_assessment_score", { ascending: false })
          .limit(1);
        if (subs?.[0]?.ai_assessment_score != null) testScore = Number(subs[0].ai_assessment_score);
      }
    }

    const colBucket = colBucketFor(vendor?.country ?? null);

    // ── 4. Supersede any prior pending recommendation for this offer ───
    await sb
      .from("vendor_negotiation_decisions")
      .update({ superseded_by_id: null }) // placeholder; updated below if we insert
      .eq("offer_id", offer_id)
      .is("decided_at", null)
      .is("superseded_by_id", null);

    // ── 5. Compose context for Claude — aggressive negotiator prompt ───
    const counterRate = Number(offer.counter_rate);
    const counterTotal = Number(offer.counter_total);
    const originalRate = Number(offer.vendor_rate);
    const originalTotal = Number(offer.vendor_total);

    // Aggressive anchor: 30% of the way from counter back toward original
    const aggressiveCounterRate = originalRate + (counterRate - originalRate) * 0.30;

    const context = {
      lane: `${srcCode.toUpperCase()} → ${tgtCode.toUpperCase()}`,
      step_name: step.name,
      client_rate_per_page_cad: clientRate,
      pool_p25: poolP25, pool_median: poolMedian, pool_p75: poolP75, pool_n: poolRates.length,
      ceiling_per_page_cad: Math.round(ceiling * 100) / 100,
      anti_lowball_floor_per_page_cad: Math.round(antiLowballFloor * 100) / 100,
      our_original_rate: originalRate,
      our_original_total: originalTotal,
      our_original_deadline: offer.deadline,
      vendor_counter_rate: counterRate,
      vendor_counter_total: counterTotal,
      vendor_counter_deadline: offer.counter_deadline,
      vendor_counter_note: offer.counter_note,
      vendor_country: vendor?.country ?? null,
      vendor_col_bucket: colBucket,
      vendor_years_experience: vendor?.years_experience ?? null,
      vendor_test_score: testScore,
      vendor_history_jobs_completed: historyJobs,
      vendor_history_accept_rate: historyAcceptRate,
      vendor_history_avg_quality: historyAvgQuality,
      aggressive_counter_anchor_rate: Math.round(aggressiveCounterRate * 100) / 100,
      max_rate_negotiated_in_offer: offer.max_rate,
      max_total_negotiated_in_offer: offer.max_total,
      latest_acceptable_deadline: offer.latest_deadline,
    };

    const aiResult = await callClaude(context);

    // Enforce hard bounds regardless of what Claude says
    let finalAction = aiResult.action;
    let finalRate = aiResult.proposed_rate;
    let finalTotal = aiResult.proposed_total;
    let finalDeadline = aiResult.proposed_deadline;

    if (finalAction === "accept" && counterRate > ceiling) {
      // Counter exceeds margin floor — staff can override but AI shouldn't
      // recommend accept.
      finalAction = "counter";
      finalRate = ceiling;
      finalTotal = counterTotal > 0 && originalRate > 0
        ? Math.round(ceiling * (counterTotal / counterRate) * 100) / 100
        : null;
    }
    if (finalAction === "counter" && finalRate != null) {
      if (finalRate > ceiling) finalRate = Math.round(ceiling * 100) / 100;
      if (finalRate < antiLowballFloor) finalRate = Math.round(antiLowballFloor * 100) / 100;
    }

    // ── 6. Write the decision row ──────────────────────────────────────
    const { data: insertedDecision } = await sb
      .from("vendor_negotiation_decisions")
      .insert({
        offer_id,
        vendor_id: offer.vendor_id,
        step_id: offer.step_id,
        application_id: vendor?.application_id ?? null,
        mode: "hitl", // Phase 1: always HITL. Phase 2 will branch here.
        trigger_event,
        original_rate: originalRate,
        original_total: originalTotal,
        original_deadline: offer.deadline,
        counter_rate: counterRate,
        counter_total: counterTotal,
        counter_deadline: offer.counter_deadline,
        counter_note: offer.counter_note,
        client_rate_used: clientRate,
        ceiling,
        anti_lowball_floor: antiLowballFloor,
        pool_p25: poolP25,
        pool_median: poolMedian,
        pool_p75: poolP75,
        pool_n: poolRates.length,
        vendor_country: vendor?.country ?? null,
        vendor_col_bucket: colBucket,
        vendor_experience_years: vendor?.years_experience ?? null,
        vendor_test_score: testScore,
        vendor_history_jobs_completed: historyJobs,
        vendor_history_accept_rate: historyAcceptRate,
        vendor_history_avg_quality: historyAvgQuality,
        ai_action: finalAction,
        ai_proposed_rate: finalRate,
        ai_proposed_total: finalTotal,
        ai_proposed_deadline: finalDeadline,
        ai_reasoning: aiResult.reasoning,
        ai_confidence: aiResult.confidence,
        ai_concerns: aiResult.concerns,
        ai_data_references: aiResult.data_references,
        ai_model_version: aiResult.model_used,
        ai_prompt_version: PROMPT_VERSION,
      })
      .select("id")
      .single();

    return json({
      success: true,
      decision_id: insertedDecision?.id ?? null,
      mode_used: "hitl",
      auto_executed: false,
      action: finalAction,
      proposed_rate: finalRate,
      proposed_total: finalTotal,
      proposed_deadline: finalDeadline,
      reasoning: aiResult.reasoning,
      confidence: aiResult.confidence,
      concerns: aiResult.concerns,
      data_references: aiResult.data_references,
      context_summary: {
        client_rate: clientRate,
        ceiling,
        anti_lowball_floor: antiLowballFloor,
        pool: { p25: poolP25, median: poolMedian, p75: poolP75, n: poolRates.length },
        vendor_history: {
          jobs_completed: historyJobs,
          accept_rate: historyAcceptRate,
        },
      },
    });
  } catch (err: any) {
    console.error("vendor-negotiate-counter error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});

interface AiResult {
  action: "accept" | "reject" | "counter" | "escalate";
  proposed_rate: number | null;
  proposed_total: number | null;
  proposed_deadline: string | null;
  reasoning: string;
  confidence: number;
  concerns: string[];
  data_references: Record<string, unknown>;
  model_used: string | null;
}

async function callClaude(context: Record<string, unknown>): Promise<AiResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fallbackRecommendation(context);

  const prompt = `You are an AGGRESSIVE but professional vendor-rate negotiator for Cethos Translation Services. The vendor has counter-offered on a project step. Your job: recommend one of {accept, reject, counter, escalate} with data-backed reasoning.

TACTIC: AGGRESSIVE counter-anchoring.
- When countering back, anchor at ~30% of the way from the vendor's counter back toward our original (NOT midpoint). The provided "aggressive_counter_anchor_rate" is calculated for you.
- Always cite specific data: pool stats, vendor history, COL bucket, client rate.
- Justify with numbers, not vibes.
- Never recommend ABOVE the ceiling (the hard margin floor for Cethos).
- Never recommend BELOW the anti-lowball floor.
- If the vendor has strong history (>5 jobs, >0.9 accept rate, >85 quality), soften the counter slightly.

DECISION POLICY:
- ACCEPT if counter_rate ≤ ceiling AND counter is within 10% of pool_median.
- REJECT if counter_rate > ceiling × 1.20 (uplift exceeds our absolute max) OR vendor history is bad (multiple declines, low quality).
- COUNTER otherwise, at the aggressive anchor (or higher if vendor's history is excellent).
- ESCALATE only if confidence is below 0.6 (e.g. missing data, unusual lane).

CONTEXT:
${JSON.stringify(context, null, 2)}

OUTPUT — strict JSON, no prose outside:
{
  "action": "accept" | "reject" | "counter" | "escalate",
  "proposed_rate": number | null,
  "proposed_total": number | null,
  "proposed_deadline": ISO timestamp string or null (only if changing deadline),
  "reasoning": "2-4 sentences citing specific numbers from the context",
  "confidence": 0.0-1.0,
  "concerns": ["string", ...],
  "data_references": {
    "client_rate": number,
    "ceiling": number,
    "pool_median": number,
    "vendor_uplift_pct": number,
    "vendor_history_summary": "string"
  }
}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.error("Claude call failed:", resp.status, await resp.text());
      return fallbackRecommendation(context);
    }
    const data = await resp.json();
    const raw = (data?.content?.[0]?.text ?? "").trim();
    // Extract first JSON object from the response (be defensive)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallbackRecommendation(context);
    const parsed = JSON.parse(match[0]);
    return {
      action: parsed.action,
      proposed_rate: parsed.proposed_rate ?? null,
      proposed_total: parsed.proposed_total ?? null,
      proposed_deadline: parsed.proposed_deadline ?? null,
      reasoning: parsed.reasoning ?? "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      data_references: parsed.data_references ?? {},
      model_used: MODEL,
    };
  } catch (err) {
    console.error("Claude parsing error:", err);
    return fallbackRecommendation(context);
  }
}

function fallbackRecommendation(context: Record<string, unknown>): AiResult {
  const ceiling = Number(context.ceiling_per_page_cad) || 0;
  const floor = Number(context.anti_lowball_floor_per_page_cad) || 0;
  const counterRate = Number(context.vendor_counter_rate) || 0;
  const originalRate = Number(context.our_original_rate) || 0;
  const anchor = Number(context.aggressive_counter_anchor_rate) || originalRate;

  let action: AiResult["action"] = "counter";
  let proposedRate = anchor;
  let reasoning = "Deterministic fallback (no Claude available).";

  if (counterRate <= ceiling && counterRate <= originalRate * 1.10) {
    action = "accept";
    proposedRate = counterRate;
    reasoning = `Counter ${counterRate} is within 10% of original ${originalRate} and below ceiling ${ceiling}; accept.`;
  } else if (counterRate > ceiling * 1.20) {
    action = "reject";
    proposedRate = ceiling;
    reasoning = `Counter ${counterRate} exceeds ceiling ${ceiling} by more than 20%; reject.`;
  } else {
    proposedRate = Math.max(floor, Math.min(ceiling, anchor));
    reasoning = `Counter ${counterRate} is above target; counter back at aggressive anchor ${proposedRate.toFixed(2)} (30% from counter toward original).`;
  }

  return {
    action,
    proposed_rate: Math.round(proposedRate * 100) / 100,
    proposed_total: null,
    proposed_deadline: null,
    reasoning,
    confidence: 0.55,
    concerns: ["No Claude reasoning available — used deterministic fallback"],
    data_references: { client_rate: context.client_rate_per_page_cad, ceiling, floor },
    model_used: null,
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
