// ============================================================================
// vendor-doc-request-status-sweep
//
// Cron: every 15 minutes (see migration 20260513_vendor_doc_request_reminders).
// - Expires any draft / sent / partial request past request_token_expires_at.
// - For active (sent / partial) requests, re-checks requested_items against
//   live vendor state so uploads / profile edits done outside the
//   /iso-evidence/:token flow auto-resolve.
// - When a request becomes fully resolved (every item completed or declined),
//   flips to 'completed' and fires vendor-iso17100-assess for a fresh verdict.
//
// Body: {} — no parameters. Service-role JWT provides DB access.
// Deploy --no-verify-jwt so the pg_cron http_post call (no Auth header) works.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  recomputeItems,
  nextStatusFromItems,
  type RequestedItem,
} from "../_shared/iso-recheck.ts";
import { requireCronSecret } from "../_shared/require-cron-secret.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
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
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();
  let expired = 0;
  let resynced = 0;
  let autoCompleted = 0;
  const errors: string[] = [];

  // 1) Expire stale tokens (draft / sent / partial past expiry).
  try {
    const { data: expiredRows, error } = await sb
      .from("vendor_document_requests")
      .update({ status: "expired" })
      .in("status", ["draft", "sent", "partial"])
      .lt("request_token_expires_at", nowIso)
      .select("id");
    if (error) errors.push(`expire: ${error.message}`);
    else expired = expiredRows?.length ?? 0;
  } catch (e) {
    errors.push(`expire-throw: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) Re-sync active requests against live vendor state.
  const { data: active, error: activeErr } = await sb
    .from("vendor_document_requests")
    .select("id, vendor_id, requested_items, status")
    .in("status", ["sent", "partial"]);
  if (activeErr) {
    errors.push(`fetch-active: ${activeErr.message}`);
    return json({ ok: errors.length === 0, expired, resynced, auto_completed: autoCompleted, errors });
  }

  for (const req of active ?? []) {
    try {
      const items = (req.requested_items as RequestedItem[]) ?? [];
      if (items.length === 0) continue;

      const [{ data: vendor }, { count: cvCount }] = await Promise.all([
        sb.from("vendors")
          .select("native_languages, years_experience, specializations, certifications")
          .eq("id", req.vendor_id)
          .maybeSingle(),
        sb.from("vendor_cvs")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", req.vendor_id),
      ]);
      if (!vendor) continue;

      const updated = recomputeItems(items, vendor, cvCount ?? 0);
      const changed = updated.some((it, i) => it.completed_at !== items[i].completed_at);
      if (!changed) continue;
      resynced++;

      const { status: nextStatus, allDone } = nextStatusFromItems(updated);
      await sb
        .from("vendor_document_requests")
        .update({
          requested_items: updated,
          status: nextStatus,
          completed_at: allDone ? nowIso : null,
          auto_synced_at: nowIso,
        })
        .eq("id", req.id);

      // When the sweep itself closes a request, fire the assessment.
      if (allDone) {
        autoCompleted++;
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceRole) {
          fetch(`${supabaseUrl}/functions/v1/vendor-iso17100-assess`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRole}`,
              apikey: serviceRole,
            },
            body: JSON.stringify({ vendor_id: req.vendor_id }),
          }).catch((e) => console.error("sweep auto-reassess fetch failed:", e));
        }
      }
    } catch (e) {
      errors.push(`req ${req.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({
    ok: errors.length === 0,
    expired,
    resynced,
    auto_completed: autoCompleted,
    errors,
  });
});
