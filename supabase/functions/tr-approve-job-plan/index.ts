// ============================================================================
// tr-approve-job-plan — gates the job into in_review. Validates that every
// required confirmation checkbox listed on the plan is ticked.
//
// Input: { job_id, plan_id, confirmation_checks: { [check_id]: boolean } }
// Output: { plan_id, approved_at }
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { CORS, json, serviceClient, actorFromRequest, writeAudit, tr } from "../_shared/tr.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { job_id, plan_id, confirmation_checks } = await req.json();
    if (!job_id || !plan_id) return json({ error: "job_id and plan_id required" }, 400);
    if (!confirmation_checks || typeof confirmation_checks !== "object") {
      return json({ error: "confirmation_checks object required" }, 400);
    }

    const sb = serviceClient();
    const actor = await actorFromRequest(req, sb);
    if (!actor.id) return json({ error: "authenticated session required for approval" }, 401);

    const { data: plan } = await tr(sb)
      .from("job_plans")
      .select("id, job_id, version, plan_jsonb, approval_status")
      .eq("id", plan_id)
      .eq("job_id", job_id)
      .maybeSingle();
    if (!plan) return json({ error: "plan not found" }, 404);
    if (plan.approval_status === "approved") return json({ error: "plan already approved" }, 409);

    // Claude's JOB_PLAN_TOOL schema doesn't constrain item shape, so
    // required_confirmation_checks comes back as either bare strings or
    // {id, label} objects depending on the call. Normalize to {id, label}
    // using the same synthesized ids the client uses (see AdminReviewJobDetail
    // — `check_<index>`), so a client-side tick maps to a server-side match.
    const rawRequired = (plan.plan_jsonb as { required_confirmation_checks?: unknown } | null)
      ?.required_confirmation_checks ?? [];
    const required: Array<{ id: string; label: string }> = Array.isArray(rawRequired)
      ? rawRequired.map((c, i) => {
          if (typeof c === "string") return { id: `check_${i + 1}`, label: c };
          if (c && typeof c === "object") {
            const obj = c as { id?: string; label?: string; text?: string; description?: string };
            const label = obj.label ?? obj.text ?? obj.description ?? obj.id ?? `Check ${i + 1}`;
            const id = obj.id ?? `check_${i + 1}`;
            return { id, label };
          }
          return { id: `check_${i + 1}`, label: String(c) };
        })
      : [];
    const missing = required.filter((c) => confirmation_checks[c.id] !== true).map((c) => c.id);
    if (missing.length) {
      return json({ error: "required confirmation checks not all ticked", missing }, 400);
    }

    await tr(sb)
      .from("job_plans")
      .update({
        approval_status: "approved",
        approved_by: actor.id,
        approved_at: new Date().toISOString(),
        confirmation_checks_jsonb: confirmation_checks,
      })
      .eq("id", plan_id);

    // Move job into in_review
    const { data: job } = await tr(sb).from("review_jobs").select("status").eq("id", job_id).maybeSingle();
    if (job?.status === "plan_pending_approval") {
      await tr(sb).from("review_jobs").update({ status: "in_review" }).eq("id", job_id);
    }

    await writeAudit(sb, {
      job_id,
      action: "job_plan_approved",
      actor_id: actor.id,
      actor_email: actor.email,
      payload: { plan_id, version: plan.version, confirmation_checks },
    });

    return json({ plan_id, approved_at: new Date().toISOString() });
  } catch (err) {
    console.error("[tr-approve-job-plan] fatal:", err);
    return json({ error: String(err) }, 500);
  }
});
