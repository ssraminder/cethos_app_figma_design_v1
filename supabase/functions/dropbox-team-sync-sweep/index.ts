/**
 * dropbox-team-sync-sweep — scheduled (hourly) replicator into the TEAM Dropbox.
 *
 * The real-time triggers in _shared/dropbox-trigger.ts still point at the legacy
 * `dropbox-sync` (-> /Cethos/Orders/...). The go-forward TEAM folder
 * (/Cethos Team Folder/01_Clients/...) was only populated by the manual
 * tmp/backfill-*.mjs scripts, so newly-paid orders never auto-reached it.
 *
 * This sweeper finds orders whose team copy is stale (public.dropbox_team_sweep_candidates)
 * and re-runs the idempotent `dropbox-team-sync` `backfill_order` on each.
 * backfill_order dedups by destination path, so a re-sweep only uploads files
 * that are missing — re-running an already-synced order is a no-op.
 *
 * Each result is recorded via public.dropbox_team_sweep_record so an order is
 * not re-swept every run (a permanently-failing order is swept once, then only
 * again when it changes or, while still active, on the periodic refresh window).
 *
 * Body (all optional):
 *   { batch, lookback_days, resweep_hours, pace_ms, time_budget_ms,
 *     dry_run, order_ids:[...] }
 * Defaults: batch=15, lookback_days=21, resweep_hours=6, pace_ms=500,
 *           time_budget_ms=110000.
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const startedAt = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return jsonResponse({ error: "SUPABASE_URL / SERVICE_ROLE not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const batch = Math.max(1, Math.min(Number(body.batch ?? 15), 100));
    const lookbackDays = Number(body.lookback_days ?? 21);
    const resweepHours = Number(body.resweep_hours ?? 6);
    const paceMs = Math.max(0, Number(body.pace_ms ?? 500));
    const timeBudgetMs = Math.max(10_000, Number(body.time_budget_ms ?? 110_000));
    const dryRun = body.dry_run === true;
    const explicitIds: string[] | null = Array.isArray(body.order_ids) && body.order_ids.length
      ? body.order_ids
      : null;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Resolve the candidate set.
    let candidates: Array<{ order_id: string; order_number: string; reason: string }> = [];
    if (explicitIds) {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number")
        .in("id", explicitIds);
      if (error) return jsonResponse({ error: `order lookup failed: ${error.message}` }, 500);
      candidates = (data ?? []).map((o: any) => ({
        order_id: o.id, order_number: o.order_number, reason: "explicit",
      }));
    } else {
      const { data, error } = await supabase.rpc("dropbox_team_sweep_candidates", {
        p_lookback_days: lookbackDays,
        p_resweep_hours: resweepHours,
        p_limit: batch,
      });
      if (error) return jsonResponse({ error: `candidate query failed: ${error.message}` }, 500);
      candidates = (data ?? []) as any[];
    }

    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        candidate_count: candidates.length,
        candidates,
        params: { batch, lookbackDays, resweepHours },
      });
    }

    // Sweep each candidate through the idempotent backfill_order, paced to keep
    // Dropbox namespace write-lock contention (too_many_write_operations) low.
    const results: Array<Record<string, unknown>> = [];
    let processed = 0, filesSynced = 0, errors = 0, skipped = 0, timedOut = false;

    for (const c of candidates) {
      if (Date.now() - startedAt > timeBudgetMs) { timedOut = true; break; }

      let status = "error", files = 0, errMsg: string | null = null;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/dropbox-team-sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "backfill_order", order_id: c.order_id }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          files = Number(json.files_synced ?? 0);
          status = "ok";
        } else if (json.skipped) {
          status = "skipped";
          errMsg = String(json.reason ?? "skipped");
        } else {
          errMsg = String(json.error ?? `HTTP ${res.status}`);
        }
      } catch (e) {
        errMsg = (e as Error).message;
      }

      // Record the attempt (atomic upsert + run_count increment).
      await supabase.rpc("dropbox_team_sweep_record", {
        p_order_id: c.order_id,
        p_files: files,
        p_status: status,
        p_error: errMsg,
      });

      processed++;
      if (status === "ok") filesSynced += files;
      else if (status === "skipped") skipped++;
      else errors++;

      results.push({ order: c.order_number, status, files_synced: files, error: errMsg });

      if (paceMs) await sleep(paceMs);
    }

    return jsonResponse({
      success: true,
      candidate_count: candidates.length,
      processed,
      files_synced: filesSynced,
      skipped,
      errors,
      timed_out: timedOut,
      elapsed_ms: Date.now() - startedAt,
      results,
    });
  } catch (err) {
    console.error("dropbox-team-sync-sweep error:", err);
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
