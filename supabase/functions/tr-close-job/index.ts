// ============================================================================
// tr-close-job — staff moves a TR review job to a terminal state.
// outcome=complete  → status = 'complete'
// outcome=cancelled → status = 'cancelled'
//
// Also stamps closed_at / closed_by / close_reason / close_outcome on
// review_jobs and posts a system close_note comment so the thread reflects
// the action.
//
// Input: { job_id, outcome: 'complete'|'cancelled', reason? }
// Output: { job_id, status, closed_at }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const job_id = body.job_id as string;
    const outcome = body.outcome as string;
    const reason = (body.reason as string | undefined)?.trim() || null;
    if (!job_id) return json({ error: "job_id required" }, 400);
    if (!["complete", "cancelled"].includes(outcome)) {
      return json({ error: "outcome must be 'complete' or 'cancelled'" }, 400);
    }

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);
    if (!actor.id) return json({ error: "authenticated session required" }, 401);

    const { data: staff } = await sb
      .from("staff_users")
      .select("id, full_name, email")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    if (!staff) return json({ error: "staff record not found" }, 403);

    const { data: job } = await tr(sb)
      .from("review_jobs")
      .select("id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);
    if (["complete", "cancelled"].includes(job.status)) {
      return json({ error: `job already ${job.status}` }, 409);
    }

    const closed_at = new Date().toISOString();
    await tr(sb)
      .from("review_jobs")
      .update({
        status: outcome,
        closed_at,
        closed_by: staff.id,
        close_reason: reason,
        close_outcome: outcome,
      })
      .eq("id", job_id);

    // System comment so the thread shows the action.
    await tr(sb).from("job_comments").insert({
      job_id,
      author_type: "system",
      author_id: staff.id,
      author_name: staff.full_name ?? staff.email,
      author_email: staff.email,
      body: reason
        ? `Job ${outcome === "complete" ? "completed" : "cancelled"} — ${reason}`
        : `Job ${outcome === "complete" ? "completed" : "cancelled"}.`,
      kind: "close_note",
    });

    await writeAudit(sb, {
      job_id,
      action: "job_closed",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: { outcome, reason, prior_status: job.status },
    });

    return json({ job_id, status: outcome, closed_at });
  } catch (err) {
    console.error("[tr-close-job] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
