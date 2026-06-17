// Staff action (safe mode): approve the AI's prescreen recommendation for an
// application and trigger the matching vendor-facing email. While safe mode
// is active, V2 (passed) and V8 (manual review) never fire automatically —
// this endpoint is the sole path to send them.
//
// POST body:
//   {
//     applicationId: string,
//     outcome: 'prescreened' | 'staff_review_notice' | 'silent',
//     staffNotes?: string,
//   }
//
// Outcomes:
//   - 'prescreened'         → status='prescreened', send V2 (passed) email
//   - 'staff_review_notice' → status='staff_review', send V8 (manual review)
//   - 'silent'              → status='staff_review' (unchanged), no email
//                             Use when applicant shouldn't be contacted yet.
//
// Every call writes a row to cvp_application_decisions for the learning loop.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import {
  buildV2PrescreenPassed,
  buildV8UnderManualReview,
} from "../_shared/email-templates.ts";
import { logDecision } from "../_shared/decision-ai.ts";
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

type Outcome = "prescreened" | "staff_review_notice" | "silent";
const VALID_OUTCOMES = new Set<Outcome>([
  "prescreened",
  "staff_review_notice",
  "silent",
]);

interface Body {
  applicationId?: string;
  outcome?: string;
  staffNotes?: string;
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
  const outcome = body.outcome as Outcome | undefined;
  if (!outcome || !VALID_OUTCOMES.has(outcome)) {
    return json(
      {
        success: false,
        error:
          "outcome must be one of: prescreened, staff_review_notice, silent",
      },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select(
      "id, email, full_name, application_number, role_type, status",
    )
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) {
    return json({ success: false, error: "application_not_found" }, 404);
  }

  const now = new Date();
  const roleTypeLabel =
    app.role_type === "translator"
      ? "Translator / Reviewer"
      : "Cognitive Debriefing Consultant";

  let newStatus: string = "staff_review";
  let subject: string | null = null;
  let html: string | null = null;
  let text: string | null = null;
  let tag = "";

  if (outcome === "prescreened") {
    newStatus = "prescreened";
    const tpl = buildV2PrescreenPassed({
      fullName: app.full_name as string,
      applicationNumber: app.application_number as string,
      roleType: roleTypeLabel,
    });
    subject = tpl.subject;
    html = tpl.html;
    text = tpl.text;
    tag = "v2-prescreen-passed";
  } else if (outcome === "staff_review_notice") {
    newStatus = "staff_review";
    const tpl = buildV8UnderManualReview({
      fullName: app.full_name as string,
      applicationNumber: app.application_number as string,
      roleType: roleTypeLabel,
    });
    subject = tpl.subject;
    html = tpl.html;
    text = tpl.text;
    tag = "v8-manual-review";
  } else {
    // 'silent' — no email
    newStatus = "staff_review";
  }

  const { error: updErr } = await supabase
    .from("cvp_applications")
    .update({
      status: newStatus,
      staff_reviewed_by: staffId,
      staff_reviewed_at: now.toISOString(),
      staff_review_notes: body.staffNotes ?? null,
      updated_at: now.toISOString(),
    })
    .eq("id", body.applicationId);
  if (updErr) {
    console.error("prescreen-outcome update failed:", updErr.message);
    return json({ success: false, error: updErr.message }, 500);
  }

  let emailSent = false;
  let suppressed = false;
  if (subject && html) {
    const result = await sendMailgunEmail({
      to: { email: app.email as string, name: app.full_name as string },
      subject,
      html,
      text: text ?? undefined,
      respectDoNotContactFor: app.email as string,
      tags: [tag, body.applicationId],
    });
    emailSent = result.sent;
    suppressed = result.suppressed;
  }

  const decisionAction =
    outcome === "prescreened"
      ? "prescreen_advanced"
      : outcome === "staff_review_notice"
      ? "prescreen_manual_review"
      : "prescreen_silent";

  await logDecision({
    supabase,
    applicationId: body.applicationId,
    action: decisionAction as
      | "prescreen_advanced"
      | "prescreen_manual_review"
      | "prescreen_silent",
    staffNotes: body.staffNotes ?? null,
    aiInputPrompt: null,
    aiOutput: null,
    aiError: null,
    messageSentSubject: subject,
    messageSentBody: html,
    staffUserId: staffId,
  });

  return json({
    success: true,
    data: {
      applicationId: body.applicationId,
      outcome,
      newStatus,
      emailSent,
      suppressed,
    },
  });
});
