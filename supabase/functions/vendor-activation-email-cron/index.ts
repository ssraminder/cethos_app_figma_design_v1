// ============================================================================
// vendor-activation-email-cron
//
// pg_cron-driven drip. Reads vendor_activation_email_schedule, picks
// up to batch_size eligible vendors (missing CV or NDA, not recently
// emailed, not suspended/inactive), and invokes vendor-send-activation-
// emails for that batch. Subject/body overrides on the schedule row
// are forwarded.
//
// Deploy --no-verify-jwt so pg_cron's plain net.http_post can reach it.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEDUP_WINDOW_DAYS = 7;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Load schedule. Exit early if disabled.
  const { data: schedule, error: sErr } = await sb
    .from("vendor_activation_email_schedule")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (sErr || !schedule) {
    return json({ ok: false, error: "schedule_lookup_failed", detail: sErr?.message });
  }
  if (!schedule.enabled) return json({ ok: true, skipped: true, reason: "disabled" });

  const batchSize: number = schedule.batch_size ?? 10;

  // 1) Pull the small recent-emails set FIRST so we can exclude already-
  //    emailed vendors at PostgREST level. Previously we queried all 1469
  //    vendors first, hit the 1000-row implicit cap, then used .in() with
  //    a huge id list on notification_log — the URL got truncated and the
  //    recentIds filter didn't catch all dedup'd rows, wasting batch slots.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRows } = await sb
    .from("notification_log")
    .select("recipient_id")
    .eq("event_type", "vendor_activation_email")
    .gte("created_at", dedupSince)
    .not("recipient_id", "is", null);
  const recentVendorIds = Array.from(
    new Set((recentRows ?? []).map((r) => r.recipient_id as string).filter(Boolean)),
  );

  // 2) Pull a candidate window of vendors that EXCLUDES recently-emailed
  //    ones at SQL level. batchSize * 5 is plenty of headroom after CV/NDA
  //    filtering, and keeps the URL short.
  let vendorQ = sb
    .from("vendors")
    .select("id, full_name, email, vendor_type, created_at")
    .not("status", "in", "(suspended,inactive)")
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(batchSize * 5, 50));
  if (recentVendorIds.length > 0) {
    vendorQ = vendorQ.not("id", "in", `(${recentVendorIds.join(",")})`);
  }
  const { data: vendors } = await vendorQ;

  if (!vendors || vendors.length === 0) {
    await sb.from("vendor_activation_email_schedule")
      .update({ last_run_at: new Date().toISOString(), last_run_sent: 0 }).eq("id", 1);
    return json({ ok: true, sent: 0, candidates: 0, recent_dedup_count: recentVendorIds.length });
  }

  // 3) Check CV / NDA on the small candidate window.
  const ids = vendors.map((v) => v.id);
  const { data: cvRows } = await sb.from("vendor_cvs").select("vendor_id").in("vendor_id", ids);
  const cvIds = new Set((cvRows ?? []).map((r) => r.vendor_id as string));
  const { data: ndaRows } = await sb
    .from("vendor_nda_signatures").select("vendor_id, is_current")
    .in("vendor_id", ids).eq("is_current", true);
  const ndaIds = new Set((ndaRows ?? []).map((r) => r.vendor_id as string));

  // 4) Pick the first batchSize that are missing at least one *required*
  //    gate. Agencies are exempt from the CV requirement — only NDA gates
  //    them. Freelancers / in-house / unknown types still need both.
  const eligible = vendors
    .filter((v) => {
      const isAgency = (v.vendor_type ?? "").toLowerCase() === "agency";
      const cvOk = isAgency || cvIds.has(v.id);
      const ndaOk = ndaIds.has(v.id);
      return !(cvOk && ndaOk);
    })
    .slice(0, batchSize)
    .map((v) => v.id);

  if (eligible.length === 0) {
    await sb.from("vendor_activation_email_schedule")
      .update({ last_run_at: new Date().toISOString(), last_run_sent: 0 }).eq("id", 1);
    return json({ ok: true, sent: 0, candidates: 0, total_eligible: 0, recent_dedup_count: recentVendorIds.length });
  }

  // Delegate the actual send to vendor-send-activation-emails. That
  // function already handles Brevo + notification_log audit; we just
  // pass it the picked vendor_ids + any subject/body overrides.
  // Use the project's anon key for the inner call — the gateway accepts
  // it as a valid JWT and we previously saw service-role bearers fail
  // silently here (no body returned, sent/failed both 0). Anon JWT is
  // public anyway (it's in the vendor portal bundle).
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Use `||` not `??` so an empty-string env var falls back to the
  // hardcoded key. Previously `??` was passing `""` through, producing
  // `Bearer ` and a 401 UNAUTHORIZED_INVALID_JWT_FORMAT from the gateway.
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim()
    || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c";
  let sentCount = 0;
  let failedCount = 0;
  let lastError: string | null = null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/vendor-send-activation-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        vendor_ids: eligible,
        subject_override: schedule.subject_override ?? undefined,
        body_html_override: schedule.body_html_override ?? undefined,
      }),
    });
    const text = await res.text();
    let result: Record<string, unknown> = {};
    try { result = JSON.parse(text) as Record<string, unknown>; } catch { /* non-json */ }
    sentCount = ((result?.data as Record<string, unknown> | undefined)?.sent ?? 0) as number;
    failedCount = ((result?.data as Record<string, unknown> | undefined)?.failed ?? 0) as number;
    if (!res.ok || sentCount === 0) {
      lastError = `inner ${res.status}: ${text.slice(0, 500)}`;
      console.error("vendor-activation-email-cron: inner returned no sends", lastError);
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    console.error("vendor-activation-email-cron: delegate send failed", e);
  }

  await sb
    .from("vendor_activation_email_schedule")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_sent: sentCount,
      total_sent: (schedule.total_sent ?? 0) + sentCount,
    })
    .eq("id", 1);

  return json({
    ok: true,
    sent: sentCount,
    failed: failedCount,
    candidates: eligible.length,
    recent_dedup_count: recentVendorIds.length,
    last_error: lastError,
  });
});
