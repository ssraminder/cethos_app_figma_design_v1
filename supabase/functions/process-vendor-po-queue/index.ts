// process-vendor-po-queue
// VERSION: 1.0.0 — Drains vendor_po_queue: for each pending row, generate the PO
// PDF then email it. Idempotent + retryable (3 attempts). Gated by the
// cvp_system_config.vendor_po_autosend kill-switch (skips entirely when OFF).
// Invoke via pg_cron (every few minutes) or manually.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: Record<string, unknown>, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const MAX_ATTEMPTS = 3, BATCH = 25;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const call = (fn: string, payload: unknown) =>
    fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));

  try {
    // Kill-switch — allow a force flag for manual/testing runs.
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { data: cfg } = await sb.from("cvp_system_config").select("value").eq("key", "vendor_po_autosend").maybeSingle();
    const on = cfg?.value === true || cfg?.value === "true";
    if (!on && !body?.force) return json({ success: true, skipped: "vendor_po_autosend is OFF", processed: 0 });

    const { data: rows } = await sb.from("vendor_po_queue").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(BATCH);
    if (!rows?.length) return json({ success: true, processed: 0 });

    let done = 0, failed = 0;
    for (const row of rows) {
      await sb.from("vendor_po_queue").update({ status: "processing", attempts: row.attempts + 1 }).eq("id", row.id);
      try {
        const gen = await call("generate-vendor-po", { workflow_step_id: row.workflow_step_id, vendor_id: row.vendor_id });
        if (!gen.ok || !gen.body?.success) throw new Error(`generate: ${gen.body?.error || "failed"}`);
        const sent = await call("send-vendor-po", { po_id: gen.body.po_id });
        if (!sent.ok || !sent.body?.success) throw new Error(`send: ${sent.body?.error || "failed"}`);
        await sb.from("vendor_po_queue").update({ status: "done", processed_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
        done++;
      } catch (e) {
        const msg = (e as Error).message;
        const terminal = row.attempts + 1 >= MAX_ATTEMPTS;
        await sb.from("vendor_po_queue").update({ status: terminal ? "error" : "pending", last_error: msg, processed_at: terminal ? new Date().toISOString() : null }).eq("id", row.id);
        failed++;
      }
    }
    return json({ success: true, processed: done, failed });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
