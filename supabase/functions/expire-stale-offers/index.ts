// ============================================================================
// expire-stale-offers — cron-fired offer expiry sweeper.
//
// REBUILT 2026-05-15 — prior bundle was lost from Supabase (404'd on every
// cron tick). Workflow audit found offers stuck `pending` long past their
// `expires_at` because nothing was flipping them.
//
// Behaviour (fire-and-forget, cron schedule */15 min):
//   * Selects every vendor_step_offers row where status IN ('pending','offered')
//     AND expires_at IS NOT NULL AND expires_at < now().
//   * Flips each to status='expired', responded_at=now().
//   * For each step that now has ZERO remaining live offers, resets the step:
//     status='pending', vendor_id=null, offered_at=null. Mirrors what
//     vendor-decline-step does on the last-offer path.
//   * Cancels each expired offer's pending vendor_payables row (only ones still
//     `pending`; never touches approved/paid).
//   * Returns a JSON summary of work done. No emails fired in this pass —
//     vendor was already warned via notify-step-lifecycle deadline reminders.
//
// Auth: this function is invoked by pg_cron via net.http_post. No bearer is
// sent; we rely on Supabase project-level gateway + verify_jwt=false. If you
// add a cron secret later, plumb it through the require-cron-secret helper.
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();

    // 1. Find stale offers.
    const { data: stale, error: staleErr } = await sb
      .from("vendor_step_offers")
      .select("id, step_id, vendor_id, status, expires_at")
      .in("status", ["pending", "offered"])
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso);

    if (staleErr) {
      console.error("expire-stale-offers select failed:", staleErr.message);
      return json({ success: false, error: staleErr.message }, 500);
    }

    const staleOffers = stale ?? [];
    if (staleOffers.length === 0) {
      return json({ success: true, expired_count: 0, steps_reset: 0 });
    }

    const expiredOfferIds = staleOffers.map((o: any) => o.id);
    const affectedStepIds = Array.from(new Set(staleOffers.map((o: any) => o.step_id)));

    // 2. Flip offers to expired.
    const { error: updErr } = await sb
      .from("vendor_step_offers")
      .update({ status: "expired", responded_at: nowIso })
      .in("id", expiredOfferIds);
    if (updErr) {
      console.error("expire-stale-offers update failed:", updErr.message);
      return json({ success: false, error: updErr.message }, 500);
    }

    // 3. Cancel each expired offer's pending payable (if any).
    await sb
      .from("vendor_payables")
      .update({ status: "cancelled" })
      .in("offer_id", expiredOfferIds)
      .eq("status", "pending");

    // 4. For each affected step, check if any live offers remain. Reset to
    // pending if not. Done one step at a time to keep the logic clear and
    // avoid a single broken step blocking the whole sweep.
    let stepsReset = 0;
    for (const stepId of affectedStepIds) {
      const { data: liveOffers, error: liveErr } = await sb
        .from("vendor_step_offers")
        .select("id")
        .eq("step_id", stepId)
        .in("status", ["pending", "offered", "accepted"])
        .limit(1);
      if (liveErr) {
        console.error(`expire-stale-offers live-check failed for step ${stepId}:`, liveErr.message);
        continue;
      }
      if ((liveOffers?.length ?? 0) === 0) {
        // Only reset steps that were in offered state. Don't touch in_progress
        // / accepted / delivered / approved steps even if their offer expired
        // for some reason (defensive).
        await sb
          .from("order_workflow_steps")
          .update({ status: "pending", vendor_id: null, offered_at: null })
          .eq("id", stepId)
          .eq("status", "offered");
        stepsReset++;
      }
    }

    return json({
      success: true,
      expired_count: staleOffers.length,
      steps_reset: stepsReset,
      expired_offer_ids: expiredOfferIds,
    });
  } catch (err: any) {
    console.error("expire-stale-offers error:", err?.message || err);
    return json({ success: false, error: err?.message || "Internal server error" }, 500);
  }
});
