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

  // Find eligible vendors: missing CV or NDA, not suspended/inactive,
  // not emailed in the last 7 days. Pick the `batch_size` oldest first
  // so we drain the queue fairly.
  const { data: vendors } = await sb
    .from("vendors")
    .select("id, full_name, email, created_at")
    .not("status", "in", "(suspended,inactive)")
    .not("email", "is", null)
    .order("created_at", { ascending: true });

  if (!vendors || vendors.length === 0) {
    await sb.from("vendor_activation_email_schedule").update({ last_run_at: new Date().toISOString(), last_run_sent: 0 }).eq("id", 1);
    return json({ ok: true, sent: 0, candidates: 0 });
  }

  const ids = vendors.map((v) => v.id);
  const { data: cvRows } = await sb.from("vendor_cvs").select("vendor_id").in("vendor_id", ids);
  const cvIds = new Set((cvRows ?? []).map((r) => r.vendor_id as string));
  const { data: ndaRows } = await sb
    .from("vendor_nda_signatures").select("vendor_id, is_current")
    .in("vendor_id", ids).eq("is_current", true);
  const ndaIds = new Set((ndaRows ?? []).map((r) => r.vendor_id as string));

  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await sb
    .from("notification_log").select("recipient_id")
    .eq("event_type", "vendor_activation_email")
    .gte("created_at", dedupSince)
    .in("recipient_id", ids);
  const recentIds = new Set((recent ?? []).map((r) => r.recipient_id as string));

  const eligible = vendors
    .filter((v) => (!cvIds.has(v.id) || !ndaIds.has(v.id)) && !recentIds.has(v.id))
    .slice(0, batchSize)
    .map((v) => v.id);

  if (eligible.length === 0) {
    await sb.from("vendor_activation_email_schedule").update({ last_run_at: new Date().toISOString(), last_run_sent: 0 }).eq("id", 1);
    return json({ ok: true, sent: 0, candidates: 0, total_eligible: 0 });
  }

  // Delegate the actual send to vendor-send-activation-emails. That
  // function already handles Brevo + notification_log audit; we just
  // pass it the picked vendor_ids + any subject/body overrides.
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let sentCount = 0;
  let failedCount = 0;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/vendor-send-activation-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
      },
      body: JSON.stringify({
        vendor_ids: eligible,
        subject_override: schedule.subject_override ?? undefined,
        body_html_override: schedule.body_html_override ?? undefined,
      }),
    });
    const result = await res.json().catch(() => ({}));
    sentCount = (result?.data?.sent ?? 0) as number;
    failedCount = (result?.data?.failed ?? 0) as number;
  } catch (e) {
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

  return json({ ok: true, sent: sentCount, failed: failedCount, candidates: eligible.length });
});
