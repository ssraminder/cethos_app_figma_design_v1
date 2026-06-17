/**
 * cvp-backfill-auto-send-general
 *
 * One-shot backfill for the April 2026 auto-send-General policy. Walks every
 * translator application and, for each one that:
 *   - has a finalised AI prescreen result (score not null, not failed)
 *   - meets the auto-send criteria in shouldAutoSendTest()
 *   - has at least one PENDING General combination (no test sent yet)
 * fires cvp-send-tests with domainFilter=["general"].
 *
 * Idempotent: if the General combo is already test_sent / completed / etc.
 * (anything other than 'pending'), the backfill skips it. Re-running is safe.
 *
 * Usage:
 *   POST /cvp-backfill-auto-send-general
 *   Body: { dryRun?: boolean, limit?: number }
 *
 * Response:
 *   { success, data: { processed, sent, skipped, details: [...] } }
 *
 * Run from a SQL session via:
 *   SELECT net.http_post(
 *     url := '<project>/functions/v1/cvp-backfill-auto-send-general',
 *     headers := jsonb_build_object('Content-Type','application/json'),
 *     body := jsonb_build_object('limit', 200)
 *   );
 *
 * Or via curl with the anon Bearer for ad-hoc runs.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { shouldAutoSendTest } from "../_shared/red-flag-weights.ts";
import { getSafeModeStatus } from "../_shared/safe-mode.ts";

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

interface AppRow {
  id: string;
  application_number: string;
  status: string;
  role_type: string | null;
  ai_prescreening_score: number | null;
  ai_prescreening_result: Record<string, unknown> | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "method_not_allowed" }, 405);
  }

  let body: {
    dryRun?: boolean;
    limit?: number;
    bypassSafeMode?: boolean;
    bypassAllGates?: boolean;
    applicationId?: string;
  } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    // empty body OK
  }
  const dryRun = body.dryRun === true;
  const bypassSafeMode = body.bypassSafeMode === true;
  const bypassAllGates = body.bypassAllGates === true;
  const limit = Math.min(Math.max(body.limit ?? 200, 1), 1000);
  const applicationId = typeof body.applicationId === "string" && body.applicationId.length > 0
    ? body.applicationId
    : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Safe mode is normally honoured. Backfill is a deliberate staff-initiated
  // catch-up action, so we expose a bypass — when bypassSafeMode=true, the
  // shouldAutoSendTest() decision proceeds as if safe mode were off. The live
  // prescreen auto-send hook does NOT have this bypass; it still respects
  // safe mode.
  const safeModeStatus = await getSafeModeStatus(supabase);
  const safeModeForDecision = bypassSafeMode ? false : safeModeStatus.active;

  // Pull every translator application that has been prescreened (score IS NOT
  // NULL). Includes 'prescreened' (≥70 with safe mode off) AND 'staff_review'
  // (50–69 OR safe mode forced everything to manual). We don't pre-filter by
  // status because the auto-send decision only needs the score + flags.
  let appQ = supabase
    .from("cvp_applications")
    .select(
      "id, application_number, status, role_type, ai_prescreening_score, ai_prescreening_result",
    )
    .eq("role_type", "translator")
    .not("ai_prescreening_score", "is", null);
  if (applicationId) {
    // Smoke / single-applicant flush: caller passes one app id, we send to
    // just that one. Useful for testing the auto-send path end-to-end
    // without touching the full backlog.
    appQ = appQ.eq("id", applicationId);
  }
  const { data: rows, error: appErr } = await appQ
    .order("created_at", { ascending: false })
    .limit(limit);

  if (appErr) {
    return json(
      { success: false, error: `query failed: ${appErr.message}` },
      500,
    );
  }

  const apps = (rows ?? []) as unknown as AppRow[];
  const details: Array<Record<string, unknown>> = [];
  let sent = 0;
  let skipped = 0;

  const fnUrl =
    (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "") +
    "/functions/v1/cvp-send-tests";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Resolve all English-variant language IDs once. The backfill only triggers
  // EN→Target tests; Target→EN tests come from Phase 2 harvest.
  const { data: enLangs } = await supabase
    .from("languages")
    .select("id")
    .ilike("name", "English%");
  const englishVariantIds =
    (enLangs ?? []).map((l) => (l as { id: string }).id);

  for (const app of apps) {
    const score = app.ai_prescreening_score ?? 0;
    const aiResult = app.ai_prescreening_result ?? {};
    const aiFailed = (aiResult as Record<string, unknown>).error === "ai_fallback";
    const flags =
      (aiResult as Record<string, unknown>).red_flags as string[] | undefined;
    const cvCorroborates =
      (aiResult as Record<string, unknown>).cv_corroborates_form as
        | string
        | undefined;

    if (aiFailed) {
      skipped += 1;
      details.push({
        id: app.id,
        appNumber: app.application_number,
        action: "skip",
        reason: "ai_fallback",
      });
      continue;
    }

    // Decision: same logic as the live prescreen path. bypassSafeMode flips
    // the safe-mode input only — every other rule (score floor, critical
    // flags, contradictions) still applies.
    // bypassAllGates short-circuits the policy check entirely — used when
    // staff wants test results from EVERY applicant (including failures and
    // cv_contradicts) to gather signal on what comes back.
    const decision = shouldAutoSendTest({
      score,
      cvCorroborates,
      flags,
      safeMode: safeModeForDecision,
    });
    if (!bypassAllGates && !decision.allowed) {
      skipped += 1;
      details.push({
        id: app.id,
        appNumber: app.application_number,
        action: "skip",
        reason: decision.reason,
        score,
      });
      continue;
    }

    // Idempotency + direction filter: only fire if there's at least one
    // PENDING General combination whose SOURCE is an English variant. Target→EN
    // combinations are out of scope for auto-send (Phase 2 harvest territory).
    let pendingQ = supabase
      .from("cvp_test_combinations")
      .select("id", { count: "exact", head: true })
      .eq("application_id", app.id)
      .eq("domain", "general")
      .eq("status", "pending");
    if (englishVariantIds.length > 0) {
      pendingQ = pendingQ.in("source_language_id", englishVariantIds);
    }
    const { count: pendingGeneral } = await pendingQ;

    if (!pendingGeneral || pendingGeneral === 0) {
      skipped += 1;
      details.push({
        id: app.id,
        appNumber: app.application_number,
        action: "skip",
        reason: "no_pending_en_to_target_general",
        score,
      });
      continue;
    }

    if (dryRun) {
      sent += 1;
      details.push({
        id: app.id,
        appNumber: app.application_number,
        action: "would_send",
        reason: "ok",
        score,
        pendingGeneralCombos: pendingGeneral,
      });
      continue;
    }

    // Real send.
    try {
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          applicationId: app.id,
          domainFilter: ["general"],
          sourceLanguageFilter: englishVariantIds,
        }),
      });
      const respJson = await resp.json().catch(() => ({}));
      if (resp.ok && (respJson as { success?: boolean }).success) {
        sent += 1;
        details.push({
          id: app.id,
          appNumber: app.application_number,
          action: "sent",
          score,
          response: respJson,
        });
      } else {
        skipped += 1;
        details.push({
          id: app.id,
          appNumber: app.application_number,
          action: "send_failed",
          score,
          status: resp.status,
          response: respJson,
        });
      }
    } catch (err) {
      skipped += 1;
      details.push({
        id: app.id,
        appNumber: app.application_number,
        action: "send_error",
        score,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({
    success: true,
    data: {
      dryRun,
      processed: apps.length,
      sent,
      skipped,
      safeMode: safeModeStatus.active,
      bypassSafeMode,
      bypassAllGates,
      details,
    },
  });
});
