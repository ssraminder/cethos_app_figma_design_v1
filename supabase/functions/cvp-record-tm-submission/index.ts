/**
 * cvp-record-tm-submission
 *
 * Server-to-server endpoint called by TM-Cethos when a translator delivers a
 * test job. TM-Cethos has the segments + translations; this endpoint records
 * the submission against the vendor-portal cvp_test_submissions row and fires
 * AI assessment.
 *
 * Why a separate function from cvp-submit-test:
 *   - cvp-submit-test is keyed by the magic-link `token` and meant for the
 *     applicant-facing direct-submit path. TM-Cethos has the submission UUID
 *     (from external_ref="test_submission:<UUID>"), not the token.
 *   - This function is shared-secret authed (TM_INBOUND_KEY) so we don't have
 *     to plumb the per-submission token through TM-Cethos.
 *
 * Auth:
 *   Authorization: Bearer <TM_INBOUND_KEY>   (shared secret, vendor-portal env)
 *
 * Body:
 *   {
 *     submissionId: string,           // UUID of cvp_test_submissions row
 *     submittedContent: string,       // concatenated translator output
 *     submittedNotes?: string,        // optional translator-side notes
 *     tmJobId?: string,               // TM-Cethos jobs.id (for logs only)
 *     skipApplicantEmail?: boolean,   // backfill mode: don't re-send V7
 *   }
 *
 * Response:
 *   { success: true, data: { submissionId, submittedAt } }
 *   or { success: false, error: string } with 400/401/404/500
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV7TestReceived } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SubmissionRow {
  id: string;
  combination_id: string;
  test_id: string;
  application_id: string;
  status: string;
  draft_content: string | null;
  submitted_at: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  // Shared-secret auth — TM-Cethos sends Authorization: Bearer <TM_INBOUND_KEY>
  const expected = Deno.env.get("TM_INBOUND_KEY") ?? "";
  if (!expected) {
    console.error("TM_INBOUND_KEY not configured on vendor-portal side");
    return jsonResponse({ success: false, error: "server_misconfigured" }, 500);
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (presented !== expected) {
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }

  let body: {
    submissionId?: string;
    submittedContent?: string;
    submittedNotes?: string;
    tmJobId?: string;
    skipApplicantEmail?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const submissionId = (body.submissionId ?? "").trim();
  const content = (body.submittedContent ?? "").trim();
  if (!submissionId) return jsonResponse({ success: false, error: "submissionId_required" }, 400);
  if (!content) return jsonResponse({ success: false, error: "submittedContent_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Fetch submission by id.
  const { data: submission, error: subErr } = await supabase
    .from("cvp_test_submissions")
    .select("id, combination_id, test_id, application_id, status, draft_content, submitted_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr || !submission) {
    return jsonResponse({ success: false, error: "submission_not_found" }, 404);
  }
  const sub = submission as unknown as SubmissionRow;

  // Idempotent: if already submitted/assessed, return success without re-firing.
  if (sub.status === "submitted" || sub.status === "assessed") {
    return jsonResponse({
      success: true,
      data: {
        submissionId: sub.id,
        submittedAt: sub.submitted_at,
        alreadyRecorded: true,
      },
    });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Mark submission as submitted, store the full text in draft_content.
  //    submitted_file_path is used for cloud-storage uploads in the legacy
  //    direct-submit path; for TM-Cethos callbacks we store text inline.
  const { error: updErr } = await supabase
    .from("cvp_test_submissions")
    .update({
      status: "submitted",
      draft_content: content,
      submitted_notes: body.submittedNotes ?? null,
      submitted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", sub.id);
  if (updErr) {
    console.error("update submission failed:", updErr);
    return jsonResponse({ success: false, error: "submission_update_failed" }, 500);
  }

  // 2) Flip the combination to test_submitted.
  await supabase
    .from("cvp_test_combinations")
    .update({ status: "test_submitted", updated_at: nowIso })
    .eq("id", sub.combination_id);

  // 3) Bump application status (test_in_progress vs test_submitted).
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
    ].includes(c.status as string)
  );
  await supabase
    .from("cvp_applications")
    .update({
      status: allDone ? "test_submitted" : "test_in_progress",
      updated_at: nowIso,
    })
    .eq("id", sub.application_id);

  // 4) V7 confirmation email — skipped on backfill.
  if (!body.skipApplicantEmail) {
    const { data: appData } = await supabase
      .from("cvp_applications")
      .select("email, full_name, application_number")
      .eq("id", sub.application_id)
      .maybeSingle();
    if (appData) {
      const app = appData as Record<string, unknown>;
      const tpl = buildV7TestReceived({
        fullName: app.full_name as string,
        applicationNumber: app.application_number as string,
      });
      try {
        await sendMailgunEmail({
          to: { email: app.email as string, name: app.full_name as string },
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          respectDoNotContactFor: app.email as string,
          tags: ["v7-test-received", sub.application_id],
        });
      } catch (mailErr) {
        console.error("V7 email send failed (non-fatal):", mailErr);
      }
    }
  }

  // 5) Fire-and-forget AI assessment.
  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
    }).catch((err) => console.error("cvp-assess-test trigger failed:", err));
  } catch (e) {
    console.error("assessment trigger error:", e);
  }

  return jsonResponse({
    success: true,
    data: { submissionId: sub.id, submittedAt: nowIso, tmJobId: body.tmJobId ?? null },
  });
});
