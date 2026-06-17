/**
 * cvp-reprocess-prescreens
 *
 * Bulk remediation: re-invoke cvp-prescreen-application for every application
 * whose last prescreen failed (ai_prescreening_result->>'error' IS NOT NULL)
 * or whose prescreen was never run and they're stuck in pre-test statuses.
 *
 * Typical trigger: after an upstream AI outage (e.g. Claude credits depleted)
 * that routed everyone to staff_review via our fallback rule.
 *
 * POST body (all optional):
 *   { applicationId?: string }        // reprocess just this one application
 *   { applicationIds?: string[] }     // reprocess this exact list (force re-run)
 *   { onlyFailed?: boolean = true }   // only re-run apps with error in result
 *   { dryRun?: boolean = false }      // list targets without invoking
 *
 * Returns:
 *   { success, data: { targets, results: [{applicationId, ok, error?}] } }
 *
 * Safe to re-run. Each per-app invocation is fire-and-forget with a short
 * timeout to avoid the bulk call timing out.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: {
    applicationId?: string;
    applicationIds?: string[];
    applicationNumbers?: string[];
    onlyFailed?: boolean;
    dryRun?: boolean;
  } = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      /* empty body is fine */
    }
  }

  const onlyFailed = body.onlyFailed !== false; // default true
  const dryRun = body.dryRun === true;

  // Collect target application IDs
  let targets: {
    id: string;
    application_number: string;
    status: string;
    ai_prescreening_result: Record<string, unknown> | null;
    ai_prescreening_score?: number | null;
    ai_prescreening_at?: string | null;
    full_name?: string;
  }[] = [];

  if (body.applicationId) {
    const { data } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name, status, ai_prescreening_result, ai_prescreening_score, ai_prescreening_at")
      .eq("id", body.applicationId)
      .maybeSingle();
    if (data) targets = [data as typeof targets[number]];
  } else if (Array.isArray(body.applicationIds) && body.applicationIds.length > 0) {
    // Forced bulk re-run by ID list — no onlyFailed filter applied.
    const { data } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name, status, ai_prescreening_result, ai_prescreening_score, ai_prescreening_at")
      .in("id", body.applicationIds);
    targets = (data ?? []) as typeof targets;
  } else if (
    Array.isArray(body.applicationNumbers) &&
    body.applicationNumbers.length > 0
  ) {
    // Forced bulk re-run by application_number list (e.g. APP-26-0004..0017).
    const { data } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name, status, ai_prescreening_result, ai_prescreening_score, ai_prescreening_at")
      .in("application_number", body.applicationNumbers);
    targets = (data ?? []) as typeof targets;
  } else {
    // Find all apps where the last prescreen failed with ai_fallback error,
    // OR apps stuck in pre-test statuses with no AI result yet.
    const { data: rows, error } = await supabase
      .from("cvp_applications")
      .select("id, application_number, full_name, status, ai_prescreening_result, ai_prescreening_score, ai_prescreening_at")
      .in("status", ["submitted", "prescreening", "staff_review", "prescreened"])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      return json({ success: false, error: error.message }, 500);
    }

    targets = (rows ?? []).filter((r) => {
      const result = r.ai_prescreening_result as Record<string, unknown> | null;
      if (!onlyFailed) return true;
      if (!result) return true;
      // Match the fallback shape written by cvp-prescreen-application
      return typeof result.error === "string" && result.error === "ai_fallback";
    }) as typeof targets;
  }

  if (dryRun) {
    return json({
      success: true,
      dryRun: true,
      data: {
        count: targets.length,
        targets: targets.map((t) => {
          const r = t.ai_prescreening_result as Record<string, unknown> | null;
          return {
            id: t.id,
            application_number: t.application_number,
            full_name: t.full_name,
            status: t.status,
            score: t.ai_prescreening_score,
            ai_at: t.ai_prescreening_at,
            cv_read: r ? r.cv_read : null,
            cv_quality: r ? r.cv_quality : null,
            cv_corroborates: r ? r.cv_corroborates_form : null,
            prompt_version: r ? r.prompt_version : null,
            model_used: r ? r.model_used : null,
            recommendation: r ? r.recommendation : null,
            red_flags: r && Array.isArray(r.red_flags) ? r.red_flags : [],
            cv_unique_signals:
              r && Array.isArray(r.cv_unique_signals) ? r.cv_unique_signals : [],
            notes: r ? r.notes : null,
            reason: r
              ? String(r["reason"] ?? r["error"] ?? "")
              : "never_prescreened",
          };
        }),
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const prescreenUrl = `${supabaseUrl}/functions/v1/cvp-prescreen-application`;

  const dispatched: { applicationId: string; application_number: string }[] = [];

  // Fire-and-forget each downstream prescreen so we return fast (edge-function
  // idle-timeout is 150s; 13 sequential Claude calls exceed that). Each
  // downstream invocation gets its own 150s budget.
  for (const t of targets) {
    // Intentionally not awaited — fire-and-forget.
    fetch(prescreenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ applicationId: t.id }),
    }).catch((err) =>
      console.error(
        `Failed to dispatch prescreen for ${t.application_number}:`,
        err,
      ),
    );
    dispatched.push({
      applicationId: t.id,
      application_number: t.application_number,
    });
  }

  console.log(
    `cvp-reprocess-prescreens: dispatched=${dispatched.length} (fire-and-forget)`,
  );

  return json({
    success: true,
    data: {
      dispatched: dispatched.length,
      apps: dispatched,
      note:
        "Prescreens run asynchronously. Check cvp_applications.ai_prescreening_at / status in 30–90s.",
    },
  });
});
