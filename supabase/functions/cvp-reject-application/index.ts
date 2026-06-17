// Staff action: reject an application.
// AI-rephrases the staff's raw notes into a polite applicant-facing reason
// summary, queues V12 inside the 48-hour intercept window (existing cron
// cvp-send-queued-rejections-hourly handles the actual send), and writes the
// full audit trail to cvp_application_decisions.
//
// POST body:
//   { applicationId, staffNotes, reapplyAfterMonths? (default 6) }
// Auth: requires Authorization: Bearer <staff JWT>; staffId derived from
// auth context via `_shared/require-staff.ts`.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildV12Rejected } from "../_shared/email-templates.ts";
import {
  claudeRewrite,
  logDecision,
  REJECT_REASON_SYSTEM_PROMPT,
} from "../_shared/decision-ai.ts";
import { requireStaff } from "../_shared/require-staff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Body {
  applicationId?: string;
  staffNotes?: string;
  reapplyAfterMonths?: number;
  /** When true, runs AI + renders preview but does NOT update status or queue email. */
  dryRun?: boolean;
  /** Staff-edited applicant-facing reason (replaces AI output when sending). */
  editedReason?: string;
  /** Staff-edited subject line (replaces default when sending). */
  editedSubject?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authed = await requireStaff(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);
  const staffId = authed.staff.staffId;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.applicationId) {
    return json({ success: false, error: "applicationId_required" }, 400);
  }
  const staffNotes = (body.staffNotes ?? "").trim();
  if (staffNotes.length < 5) {
    return json({ success: false, error: "staffNotes_too_short" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number, status")
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) {
    return json({ success: false, error: "application_not_found" }, 404);
  }

  const now = new Date();
  const reapplyMonths = body.reapplyAfterMonths ?? 6;
  const reapplyAfter = new Date(now);
  reapplyAfter.setMonth(reapplyAfter.getMonth() + reapplyMonths);
  const reapplyAfterDate = reapplyAfter.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // AI-rephrase staff notes into applicant-facing reason summary.
  const userPrompt = `Applicant: ${app.full_name}\nApplication: ${app.application_number}\n\nStaff notes (internal):\n${staffNotes}`;
  const ai = await claudeRewrite({
    systemPrompt: REJECT_REASON_SYSTEM_PROMPT,
    userMessage: userPrompt,
    maxTokens: 400,
  });
  const aiReason =
    ai.ok && ai.text
      ? ai.text
      : "After reviewing the materials submitted, our team has decided not to proceed at this time.";

  // Staff-edited override takes precedence over AI output when sending.
  const editedReason = (body.editedReason ?? "").trim();
  const reasonSummary = editedReason || aiReason;

  // Pre-render the V12 body so we can store it for audit alongside what was queued.
  const tpl = buildV12Rejected({
    fullName: app.full_name as string,
    applicationNumber: app.application_number as string,
    reasonSummary,
    reapplyAfterDate,
  });
  const subject = (body.editedSubject ?? "").trim() || tpl.subject;

  // ---- Preview mode: return rendered content without any DB mutation ----
  if (body.dryRun === true) {
    return json({
      success: true,
      data: {
        dryRun: true,
        aiOutput: aiReason,
        aiError: ai.ok ? null : ai.error,
        subject,
        html: tpl.html,
        text: tpl.text,
        reapplyAfterDate,
      },
    });
  }

  // Status → rejected; queue email; cron sends after 48h intercept window.
  const editedSubject = (body.editedSubject ?? "").trim();
  const { error: updErr } = await supabase
    .from("cvp_applications")
    .update({
      status: "rejected",
      rejection_reason: reasonSummary,
      rejection_email_draft: tpl.html,
      rejection_email_subject_override: editedSubject || null,
      rejection_email_status: "queued",
      rejection_email_queued_at: now.toISOString(),
      can_reapply_after: reapplyAfter.toISOString().split("T")[0],
      staff_reviewed_by: staffId,
      staff_reviewed_at: now.toISOString(),
      staff_review_notes: staffNotes,
      updated_at: now.toISOString(),
    })
    .eq("id", body.applicationId);

  if (updErr) {
    console.error("Reject update failed:", updErr.message);
    return json({ success: false, error: updErr.message }, 500);
  }

  await logDecision({
    supabase,
    applicationId: body.applicationId,
    action: "rejected",
    staffNotes,
    aiInputPrompt: userPrompt,
    aiOutput: ai.ok ? ai.text : null,
    aiError: ai.ok ? null : ai.error,
    messageSentSubject: subject,
    messageSentBody: tpl.html,
    staffUserId: staffId,
  });

  return json({
    success: true,
    data: {
      applicationId: body.applicationId,
      reasonSummary,
      reapplyAfterDate,
      aiProcessed: ai.ok,
      queuedAt: now.toISOString(),
      sendsAfter: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
    },
  });
});
