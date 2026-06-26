// ============================================================================
// advance-training-sequence
//
// Drives the general-training PATHWAY: when a vendor completes a training that
// has a `cvp_trainings.sequence_order`, the next-higher-order training in the
// sequence is auto-assigned and the assignment email is sent. One step at a
// time per vendor; stops at the end of the sequence.
//
// Invoked two ways (both safe + idempotent):
//   • event  — DB trigger on cvp_training_completions (AFTER INSERT) pings this
//              with { vendor_id } the moment a completion lands ("as soon as
//              the first one completes").
//   • sweep  — pg_cron pings this with {} every ~15 min as a self-healing
//              backstop in case a trigger ping was missed.
//
// The SQL fn cvp_advance_training_sequence(p_vendor_id) does the atomic
// assignment (ON CONFLICT DO NOTHING) and RETURNS only the rows it NEWLY
// assigned — so we only ever email a vendor a given step once, even if the
// trigger and the cron race.
//
// POST body: { vendor_id?: string }   (omit vendor_id for a full sweep)
// Auth: deploy --no-verify-jwt. Server-to-server only (trigger / cron).
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: Record<string, unknown>, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { vendor_id?: string } = {};
  try { body = await req.json(); } catch { /* empty = sweep */ }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(url, service);

  // Atomically assign each (in-scope) vendor's next uncompleted sequence
  // training; returns only the assignments newly created now.
  const { data: rows, error } = await sb.rpc("cvp_advance_training_sequence", {
    p_vendor_id: body.vendor_id ?? null,
  });
  if (error) return json({ success: false, error: "advance_failed", detail: error.message }, 500);

  const advanced = (rows ?? []) as { vendor_id: string; training_id: string }[];
  if (advanced.length === 0) {
    return json({ success: true, data: { advanced: 0, emailed: 0, byTraining: [] } });
  }

  // Group the newly-assigned vendors by training and email each group via the
  // finalized assignment email (vendor-send-training-assignment handles the
  // Mailgun batch + notification_log audit).
  const byTraining: Record<string, string[]> = {};
  for (const r of advanced) (byTraining[r.training_id] ??= []).push(r.vendor_id);

  let emailed = 0;
  const results: { training_id: string; assigned: number; sent: number; error?: string }[] = [];
  for (const [trainingId, vendorIds] of Object.entries(byTraining)) {
    try {
      const res = await fetch(`${url}/functions/v1/vendor-send-training-assignment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${service}`,
          apikey: service,
        },
        body: JSON.stringify({ training_id: trainingId, vendor_ids: vendorIds }),
      });
      const j = (await res.json().catch(() => ({}))) as { data?: { sent?: number } };
      const sent = j?.data?.sent ?? 0;
      emailed += sent;
      results.push({ training_id: trainingId, assigned: vendorIds.length, sent });
    } catch (e) {
      results.push({ training_id: trainingId, assigned: vendorIds.length, sent: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ success: true, data: { advanced: advanced.length, emailed, byTraining: results } });
});
