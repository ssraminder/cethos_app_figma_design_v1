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
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

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

  const authed = await requireCronSecret(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);

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

  // 1) Pull the recent-emails set so we can dedup in-memory. URL-level
  //    .not("id","in","(...)") exclusion blows past PostgREST's URL
  //    length limit once recent_count > ~200 (UUIDs are 37 chars), so
  //    the candidate query silently returned 0 rows and the cron sat
  //    on candidates:0 / sent:0 even with 1000+ vendors backlogged.
  //    See incident 2026-05-14 → 2026-05-15.
  //
  //    notification_log itself ALSO hits PostgREST's 1000-row cap once
  //    weekly sends exceed 1000 (1016 on 2026-05-19). A single .select()
  //    silently truncates and the missed dedup entries get re-picked by
  //    the candidate scan — the inner sender then re-dedups via .in()
  //    (uncapped because it's filtered to ≤ batchSize IDs) and drops
  //    everything, so the cron returns sent:0 even though candidates
  //    exist. Paginate this fetch too.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const LOG_PAGE_SIZE = 1000;
  const LOG_MAX_PAGES = 10;
  const recentVendorIdSet = new Set<string>();
  for (let page = 0; page < LOG_MAX_PAGES; page++) {
    const from = page * LOG_PAGE_SIZE;
    const { data: logRows, error: logErr } = await sb
      .from("notification_log")
      .select("recipient_id")
      .eq("event_type", "vendor_activation_email")
      .gte("created_at", dedupSince)
      .not("recipient_id", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + LOG_PAGE_SIZE - 1);
    if (logErr) {
      console.error("vendor-activation-email-cron: notification_log page fetch failed", logErr);
      break;
    }
    if (!logRows || logRows.length === 0) break;
    for (const r of logRows) {
      const id = (r as { recipient_id: string | null }).recipient_id;
      if (id) recentVendorIdSet.add(id);
    }
    if (logRows.length < LOG_PAGE_SIZE) break;
  }

  // 2) Pull vendors ordered by created_at ASC and exclude recent in-memory.
  //    PostgREST caps a single response at 1000 rows; once the dedup set
  //    grows past ~1000 the oldest-1000 page becomes entirely dedup'd and
  //    the cron silently returns 0 even when hundreds of newer vendors
  //    still need their first drip. Incident 2026-05-19: dedup set was
  //    1016 → cron sat on sent:0 for 36h with 269 vendors stranded.
  //    Paginate via .range() until we exhaust the table or hit MAX_PAGES.
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 5;
  type VendorRow = {
    id: string;
    full_name: string | null;
    email: string;
    vendor_type: string | null;
    created_at: string;
  };
  const vendors: VendorRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data: pageRows, error: pageErr } = await sb
      .from("vendors")
      .select("id, full_name, email, vendor_type, created_at")
      .not("status", "in", "(suspended,inactive)")
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (pageErr) {
      console.error("vendor-activation-email-cron: vendors page fetch failed", pageErr);
      break;
    }
    if (!pageRows || pageRows.length === 0) break;
    for (const v of pageRows as VendorRow[]) {
      if (!recentVendorIdSet.has(v.id)) vendors.push(v);
    }
    if (pageRows.length < PAGE_SIZE) break;
  }

  if (!vendors || vendors.length === 0) {
    await sb.from("vendor_activation_email_schedule")
      .update({ last_run_at: new Date().toISOString(), last_run_sent: 0 }).eq("id", 1);
    return json({ ok: true, sent: 0, candidates: 0, recent_dedup_count: recentVendorIdSet.size });
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
    return json({ ok: true, sent: 0, candidates: 0, total_eligible: 0, recent_dedup_count: recentVendorIdSet.size });
  }

  // Delegate the actual send to vendor-send-activation-emails. That
  // function already handles Brevo + notification_log audit; we just
  // pass it the picked vendor_ids + any subject/body overrides.
  // Use the project's anon key for the inner call — the gateway accepts
  // it as a valid JWT and we previously saw service-role bearers fail
  // silently here (no body returned, sent/failed both 0). Anon JWT is
  // public anyway (it's in the vendor portal bundle).
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Hardcoded — env-based lookup (via `??` and even `||`) keeps biting us:
  // when SUPABASE_ANON_KEY in edge secrets is a stale/rotated value the
  // fallback never triggers and the gateway 401s with
  // UNAUTHORIZED_INVALID_JWT_FORMAT. The anon JWT is public anyway (it
  // ships in the vendor portal bundle), so inlining it has zero security
  // cost. v5 used this same pattern and worked; v6/v7 regressed by
  // re-introducing env reads.
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtem95ZXp2c2pnc3h2ZW9ha2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NDkzNTIsImV4cCI6MjA4NDQyNTM1Mn0.6XtRrAuganzIb65FbG_NKQ8JuOxoPLSXBYsffZg2Y3c";
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
    recent_dedup_count: recentVendorIdSet.size,
    last_error: lastError,
  });
});
