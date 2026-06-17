// One-shot reconciler for vendor-portal cvp_test_submissions rows where
// TM-Cethos marked the test job 'submitted' but the vendor-portal callback
// (cvp-record-tm-submission) never landed, leaving the row stuck at
// 'sent' / 'viewed' / 'draft_saved' / 'expired'.
//
// Auth: requires service-role JWT (verify_jwt=true).
// Body: { items: [{ submissionId, submittedContent, submittedAt? }], skipAssess?: boolean, dryRun?: boolean }
// Returns: { success, results: [{ submissionId, action: 'reconciled' | 'skipped:<reason>' | 'error:<msg>' }] }
//
// Idempotent: if a row is already 'submitted' or 'assessed', it's skipped.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Item {
  submissionId: string;
  submittedContent: string;
  submittedAt?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  let body: { items?: Item[]; skipAssess?: boolean; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return jsonResponse({ success: false, error: "items array required" }, 400);
  }
  const skipAssess = body.skipAssess === true;
  const dryRun = body.dryRun === true;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const results: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const submissionId = (item.submissionId ?? "").trim();
    const content = item.submittedContent ?? "";
    if (!submissionId) {
      results.push({ submissionId, action: "error:missing_submissionId" });
      continue;
    }
    if (!content || content.trim() === "") {
      results.push({ submissionId, action: "error:empty_content" });
      continue;
    }

    const { data: sub, error: subErr } = await supabase
      .from("cvp_test_submissions")
      .select("id, combination_id, application_id, status, submitted_at")
      .eq("id", submissionId)
      .maybeSingle();

    if (subErr || !sub) {
      results.push({ submissionId, action: `error:${subErr?.message ?? "not_found"}` });
      continue;
    }
    if (sub.status === "submitted" || sub.status === "assessed") {
      results.push({ submissionId, action: "skipped:already_reconciled", currentStatus: sub.status });
      continue;
    }

    if (dryRun) {
      results.push({ submissionId, action: "dryrun:would_reconcile", currentStatus: sub.status, contentChars: content.length });
      continue;
    }

    const submittedAt = item.submittedAt ?? new Date().toISOString();
    const nowIso = new Date().toISOString();

    // 1) Flip submission to 'submitted', stash translation
    const { error: updErr } = await supabase
      .from("cvp_test_submissions")
      .update({
        status: "submitted",
        draft_content: content,
        submitted_at: submittedAt,
        submitted_notes: "[Reconciled from TM-Cethos on " + nowIso + " — original TM→vendor-portal callback failed]",
        updated_at: nowIso,
      })
      .eq("id", sub.id);
    if (updErr) {
      results.push({ submissionId, action: `error:update_submission:${updErr.message}` });
      continue;
    }

    // 2) Flip combination to test_submitted
    await supabase
      .from("cvp_test_combinations")
      .update({ status: "test_submitted", updated_at: nowIso })
      .eq("id", sub.combination_id);

    // 3) Bump application status (test_submitted vs test_in_progress)
    const { data: allCombos } = await supabase
      .from("cvp_test_combinations")
      .select("status")
      .eq("application_id", sub.application_id);
    const allDone = (allCombos ?? []).every((c: Record<string, unknown>) =>
      [
        "test_submitted",
        "assessed",
        "approved",
        "rejected",
        "skipped",
        "no_test_available",
        "skip_manual_review",
        "completed",
      ].includes(c.status as string),
    );
    await supabase
      .from("cvp_applications")
      .update({
        status: allDone ? "test_submitted" : "test_in_progress",
        updated_at: nowIso,
      })
      .eq("id", sub.application_id);

    // 4) Trigger cvp-assess-test (fire-and-forget)
    if (!skipAssess) {
      fetch(`${supabaseUrl}/functions/v1/cvp-assess-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          submissionId: sub.id,
          combinationId: sub.combination_id,
        }),
      }).catch((err) => console.error(`assess trigger failed for ${sub.id}:`, err));
    }

    results.push({ submissionId, action: "reconciled", submittedAt });
  }

  return jsonResponse({ success: true, results });
});
