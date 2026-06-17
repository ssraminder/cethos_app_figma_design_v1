// Staff action: ask the applicant for additional information.
// Sets cvp_applications.status='info_requested', stores raw staff notes,
// runs them through Claude to produce a polished applicant-facing message,
// sends V17, and writes the full audit trail to cvp_application_decisions.
//
// POST body:
//   { applicationId, staffNotes, deadlineDays? (default 7) }
// Auth: requires Authorization: Bearer <staff JWT>; staffId derived from
// auth context via `_shared/require-staff.ts`.
// (legacy `requestDetails` accepted as alias for staffNotes)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV17RequestMoreInfo } from "../_shared/email-templates.ts";
import {
  claudeRewrite,
  logDecision,
  REQUEST_INFO_SYSTEM_PROMPT,
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
  /** Legacy alias for staffNotes (early callers used this name). */
  requestDetails?: string;
  /** Internal-auto alias for staffNotes (system-generated missing-docs text). */
  systemNotes?: string;
  deadlineDays?: number;
  /** Preview-only: run AI + render V17, return without sending or updating status. */
  dryRun?: boolean;
  /** Staff-edited applicant-facing request (replaces AI output when sending). */
  editedRequest?: string;
  /** Staff-edited subject line (replaces template default when sending). */
  editedSubject?: string;
  /**
   * Internal-auto invocation (e.g. cvp-prescreen-application). When true the
   * caller MUST present the service-role key as the Bearer token; staff JWT is
   * not required and the decision is logged with actor = system (staffId from
   * actingStaffId, else null). Mirrors cvp-approve-application's internal-auto.
   */
  internalAuto?: boolean;
  /** Optional accountable staff id recorded on a system-triggered request. */
  actingStaffId?: string;
  /**
   * Internal-auto only: send the request email + log the decision but DO NOT
   * change cvp_applications.status. Used when the applicant is also advancing
   * on another track (e.g. a test in flight) so the documentation chase
   * doesn't clobber the test-path status. When omitted, status→info_requested.
   */
  skipStatusUpdate?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  // Auth: internal-auto (service-role Bearer) bypasses requireStaff and acts as
  // the system; otherwise a staff JWT is required. External callers can't use
  // internalAuto because they don't hold the service-role key.
  let staffId: string | null;
  if (body.internalAuto === true) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!serviceKey || token !== serviceKey) {
      return json({ success: false, error: "internal_auto_requires_service_role" }, 403);
    }
    staffId = body.actingStaffId ?? null;
  } else {
    const authed = await requireStaff(req);
    if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);
    staffId = authed.staff.staffId;
  }

  const staffNotes = (body.staffNotes ?? body.requestDetails ?? body.systemNotes ?? "").trim();
  if (!body.applicationId) {
    return json({ success: false, error: "applicationId_required" }, 400);
  }
  if (staffNotes.length < 5) {
    return json({ success: false, error: "staffNotes_too_short" }, 400);
  }

  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number")
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) return json({ success: false, error: "application_not_found" }, 404);

  const now = new Date();
  const deadlineDays = body.deadlineDays ?? 7;
  const deadline = new Date(now.getTime() + deadlineDays * 24 * 3600 * 1000);
  const deadlineDate = deadline.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Run staff notes through Claude. On failure, fall back to verbatim notes
  // so the request still goes out — never block the staff action on AI.
  const userPrompt = `Applicant: ${app.full_name}\nApplication: ${app.application_number}\nDeadline: ${deadlineDate}\n\nStaff notes:\n${staffNotes}`;
  const ai = await claudeRewrite({
    systemPrompt: REQUEST_INFO_SYSTEM_PROMPT,
    userMessage: userPrompt,
    maxTokens: 600,
  });
  const aiRequest = ai.ok && ai.text ? ai.text : staffNotes;

  // Staff-edited request overrides AI output at send-time.
  const editedRequest = (body.editedRequest ?? "").trim();
  const requestDetailsForApplicant = editedRequest || aiRequest;

  const tpl = buildV17RequestMoreInfo({
    fullName: app.full_name as string,
    applicationNumber: app.application_number as string,
    requestDetails: requestDetailsForApplicant,
    infoDeadlineDate: deadlineDate,
  });
  const subject = (body.editedSubject ?? "").trim() || tpl.subject;

  if (body.dryRun === true) {
    return json({
      success: true,
      data: {
        dryRun: true,
        aiOutput: aiRequest,
        aiError: ai.ok ? null : ai.error,
        subject,
        html: tpl.html,
        text: tpl.text,
        deadlineDate,
      },
    });
  }

  // Internal-auto with skipStatusUpdate: send + log only, leave status untouched
  // (applicant is progressing on another track, e.g. a test in flight).
  if (body.skipStatusUpdate === true) {
    await supabase
      .from("cvp_applications")
      .update({ updated_at: now.toISOString() })
      .eq("id", body.applicationId);
  } else {
    await supabase
      .from("cvp_applications")
      .update({
        status: "info_requested",
        staff_review_notes: staffNotes,
        staff_reviewed_by: staffId,
        staff_reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", body.applicationId);
  }

  const result = await sendMailgunEmail({
    to: { email: app.email as string, name: app.full_name as string },
    subject,
    html: tpl.html,
    text: tpl.text,
    respectDoNotContactFor: app.email as string,
    tags: ["v17-request-more-info", body.applicationId],
    trackContext: {
      applicationId: body.applicationId,
      templateTag: "v17-request-more-info",
      staffUserId: staffId,
    },
  });

  await logDecision({
    supabase,
    applicationId: body.applicationId,
    action: "info_requested",
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
      emailSent: result.sent,
      suppressed: result.suppressed,
      aiProcessed: ai.ok,
      aiOutputPreview: (ai.text ?? "").slice(0, 200),
    },
  });
});
