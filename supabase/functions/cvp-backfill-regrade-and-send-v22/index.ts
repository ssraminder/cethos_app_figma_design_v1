/**
 * cvp-backfill-regrade-and-send-v22
 *
 * One-shot backfill: re-grade every cvp_test_submissions whose combination
 * is in (assessed | approved | rejected) under the corrected prompt, then
 * re-issue V22 to the applicant. Used after the domain-aware prompt fix.
 *
 * Modes:
 *   - { action: "start" }                  → create a new regrade job, kick off processing
 *   - { action: "tick", jobId }            → process the next batch (called by cron OR by start)
 *   - { action: "status", jobId }          → return job progress
 *   - { action: "cancel", jobId }          → mark cancelled (in-flight batches finish)
 *
 * Each tick processes BATCH_SIZE submissions: regrade serially (each AI call
 * takes 30-90s), then schedule V22 with auto_send_at = now() (no 24h wait
 * for backfill — admin already approved the resend).
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 5; // Each AI call ≈ 60s; 5 fits within the 150s edge limit.

interface JobRow {
  id: string;
  prompt_version: string | null;
  total: number;
  completed: number;
  errored: number;
  status: string;
}

interface SubmissionRow {
  id: string;
  combination_id: string;
  application_id: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  let body: { action?: string; jobId?: string; promptVersion?: string; createdBy?: string } = {};
  try { body = await req.json(); } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  switch ((body.action ?? "").toLowerCase()) {
    case "start": {
      // Reject if a job is already running.
      const { data: existing } = await supabase
        .from("cvp_test_regrade_jobs")
        .select("id, status")
        .in("status", ["pending", "running"])
        .limit(1)
        .maybeSingle();
      if (existing) {
        return jsonResponse({
          success: false,
          error: "job_already_running",
          data: { jobId: (existing as JobRow).id },
        }, 409);
      }

      // Count eligible submissions (combinations in assessed/approved/rejected,
      // not already processed by a prior job).
      const { count: total } = await supabase
        .from("cvp_test_submissions")
        .select("id, cvp_test_combinations!inner(status, regrade_job_id)", { count: "exact", head: true })
        .in("cvp_test_combinations.status", ["assessed", "approved", "rejected"])
        .is("cvp_test_combinations.regrade_job_id", null);

      const { data: jobRow, error: jobErr } = await supabase
        .from("cvp_test_regrade_jobs")
        .insert({
          prompt_version: body.promptVersion ?? null,
          total: total ?? 0,
          status: "running",
          started_at: new Date().toISOString(),
          created_by: body.createdBy ?? null,
        })
        .select()
        .single();
      if (jobErr || !jobRow) {
        return jsonResponse({ success: false, error: jobErr?.message ?? "job_create_failed" }, 500);
      }

      // Fire-and-forget the first tick.
      fetch(`${supabaseUrl}/functions/v1/cvp-backfill-regrade-and-send-v22`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ action: "tick", jobId: (jobRow as JobRow).id }),
      }).catch((e) => console.error("backfill tick kick-off failed:", e));

      return jsonResponse({
        success: true,
        data: { jobId: (jobRow as JobRow).id, total: total ?? 0 },
      });
    }

    case "status": {
      if (!body.jobId) return jsonResponse({ success: false, error: "jobId_required" }, 400);
      const { data: jobRow } = await supabase
        .from("cvp_test_regrade_jobs")
        .select("*")
        .eq("id", body.jobId)
        .maybeSingle();
      if (!jobRow) return jsonResponse({ success: false, error: "job_not_found" }, 404);
      return jsonResponse({ success: true, data: jobRow });
    }

    case "cancel": {
      if (!body.jobId) return jsonResponse({ success: false, error: "jobId_required" }, 400);
      await supabase
        .from("cvp_test_regrade_jobs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", body.jobId)
        .in("status", ["pending", "running"]);
      return jsonResponse({ success: true, data: { jobId: body.jobId, status: "cancelled" } });
    }

    case "tick": {
      if (!body.jobId) return jsonResponse({ success: false, error: "jobId_required" }, 400);
      const { data: jobRow } = await supabase
        .from("cvp_test_regrade_jobs")
        .select("id, prompt_version, total, completed, errored, status")
        .eq("id", body.jobId)
        .maybeSingle();
      if (!jobRow) return jsonResponse({ success: false, error: "job_not_found" }, 404);
      const job = jobRow as JobRow;
      if (job.status !== "running") {
        return jsonResponse({ success: true, data: { skipped: true, status: job.status } });
      }

      // Pull next batch of unprocessed submissions.
      const { data: subs } = await supabase
        .from("cvp_test_submissions")
        .select("id, combination_id, application_id, cvp_test_combinations!inner(status, regrade_job_id)")
        .in("cvp_test_combinations.status", ["assessed", "approved", "rejected"])
        .is("cvp_test_combinations.regrade_job_id", null)
        .limit(BATCH_SIZE);

      const batch = (subs ?? []) as unknown as SubmissionRow[];
      if (batch.length === 0) {
        await supabase
          .from("cvp_test_regrade_jobs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", job.id);
        return jsonResponse({ success: true, data: { jobId: job.id, status: "completed" } });
      }

      let completed = job.completed;
      let errored = job.errored;
      const log: { submissionId: string; ok: boolean; error?: string }[] = [];

      for (const sub of batch) {
        try {
          // Stamp the combination first so a crashed batch doesn't double-grade.
          await supabase
            .from("cvp_test_combinations")
            .update({ regrade_job_id: job.id, updated_at: new Date().toISOString() })
            .eq("id", sub.combination_id);

          // Re-grade.
          const gradeRes = await fetch(`${supabaseUrl}/functions/v1/cvp-assess-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ submissionId: sub.id, combinationId: sub.combination_id }),
          });
          const gradeJson = (await gradeRes.json()) as { success?: boolean; error?: string };
          if (!gradeJson.success) {
            errored += 1;
            log.push({ submissionId: sub.id, ok: false, error: gradeJson.error ?? "regrade_failed" });
            continue;
          }

          // Replace any existing feedback round so V22 fires immediately.
          // Backfill skips the 24h delay — admins already approved the resend.
          const token = makeToken();
          const nowIso = new Date().toISOString();
          const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

          const { data: existing } = await supabase
            .from("cvp_test_feedback_rounds")
            .select("submission_id")
            .eq("submission_id", sub.id)
            .maybeSingle();
          if (existing) {
            await supabase
              .from("cvp_test_feedback_rounds")
              .update({
                token,
                status: "pending",
                staff_skip: false,
                auto_send_at: nowIso,
                auto_sent_at: null,
                manual_send_requested_at: null,
                auto_send_attempts: 0,
                auto_send_last_error: null,
                expires_at: expiresAt,
                updated_at: nowIso,
              })
              .eq("submission_id", sub.id);
          } else {
            await supabase
              .from("cvp_test_feedback_rounds")
              .insert({
                submission_id: sub.id,
                combination_id: sub.combination_id,
                token,
                status: "pending",
                auto_send_at: nowIso,
                expires_at: expiresAt,
              });
          }

          completed += 1;
          log.push({ submissionId: sub.id, ok: true });
        } catch (err) {
          errored += 1;
          log.push({
            submissionId: sub.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await supabase
        .from("cvp_test_regrade_jobs")
        .update({
          completed,
          errored,
          log: log,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      // Kick off the next tick if there's likely more work.
      fetch(`${supabaseUrl}/functions/v1/cvp-backfill-regrade-and-send-v22`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ action: "tick", jobId: job.id }),
      }).catch((e) => console.error("backfill next-tick kick-off failed:", e));

      return jsonResponse({
        success: true,
        data: { jobId: job.id, batchProcessed: batch.length, completed, errored },
      });
    }

    default:
      return jsonResponse({ success: false, error: "unknown_action" }, 400);
  }
});
