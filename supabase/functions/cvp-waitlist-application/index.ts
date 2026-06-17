// Staff action: place an application on the waitlist.
// AI-rephrases the staff's raw notes into a polite applicant-facing line that
// explains the wait, sends V13 immediately, and writes the audit trail.
//
// POST body:
//   { applicationId, staffNotes, waitlistPair?, staffId? }
// waitlistPair defaults to "your language pair".

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV13Waitlisted } from "../_shared/email-templates.ts";
import {
  claudeRewrite,
  logDecision,
  WAITLIST_NOTE_SYSTEM_PROMPT,
} from "../_shared/decision-ai.ts";

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
  waitlistPair?: string;
  staffId?: string;
  /** Preview-only: run AI + render V13, return without sending or updating status. */
  dryRun?: boolean;
  /** Staff-edited applicant-facing message (replaces AI output when sending). */
  editedMessage?: string;
  /** Staff-edited subject line (replaces template default when sending). */
  editedSubject?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

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
    .select("id, email, full_name, application_number, waitlist_language_pair")
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) {
    return json({ success: false, error: "application_not_found" }, 404);
  }

  const waitlistPair =
    body.waitlistPair ??
    (app.waitlist_language_pair as string | null) ??
    "your language pair";

  // AI rewrites the staff note into a short applicant-facing sentence.
  const userPrompt = `Applicant: ${app.full_name}\nApplication: ${app.application_number}\nLanguage pair: ${waitlistPair}\n\nStaff notes (internal):\n${staffNotes}`;
  const ai = await claudeRewrite({
    systemPrompt: WAITLIST_NOTE_SYSTEM_PROMPT,
    userMessage: userPrompt,
    maxTokens: 300,
  });
  const aiMessage = ai.ok && ai.text ? ai.text : null;

  // Staff-edited message overrides the AI output at send-time.
  const editedMessage = (body.editedMessage ?? "").trim();
  const staffMessage = editedMessage || aiMessage;

  const tpl = buildV13Waitlisted({
    fullName: app.full_name as string,
    applicationNumber: app.application_number as string,
    waitlistPair,
    staffMessage,
  });
  const subject = (body.editedSubject ?? "").trim() || tpl.subject;

  // Preview: return the rendered email without sending or updating status.
  if (body.dryRun === true) {
    return json({
      success: true,
      data: {
        dryRun: true,
        aiOutput: aiMessage,
        aiError: ai.ok ? null : ai.error,
        subject,
        html: tpl.html,
        text: tpl.text,
        waitlistPair,
      },
    });
  }

  const now = new Date();
  const { error: updErr } = await supabase
    .from("cvp_applications")
    .update({
      status: "waitlisted",
      waitlist_language_pair: waitlistPair,
      waitlist_notes: staffNotes,
      staff_reviewed_by: body.staffId ?? null,
      staff_reviewed_at: now.toISOString(),
      staff_review_notes: staffNotes,
      updated_at: now.toISOString(),
    })
    .eq("id", body.applicationId);
  if (updErr) {
    console.error("Waitlist update failed:", updErr.message);
    return json({ success: false, error: updErr.message }, 500);
  }

  const sendResult = await sendMailgunEmail({
    to: { email: app.email as string, name: app.full_name as string },
    subject,
    html: tpl.html,
    text: tpl.text,
    respectDoNotContactFor: app.email as string,
    tags: ["v13-waitlisted", body.applicationId],
    trackContext: {
      applicationId: body.applicationId,
      templateTag: "v13-waitlisted",
      staffUserId: body.staffId,
    },
  });

  await logDecision({
    supabase,
    applicationId: body.applicationId,
    action: "waitlisted",
    staffNotes,
    aiInputPrompt: userPrompt,
    aiOutput: ai.ok ? ai.text : null,
    aiError: ai.ok ? null : ai.error,
    messageSentSubject: subject,
    messageSentBody: tpl.html,
    staffUserId: body.staffId ?? null,
  });

  return json({
    success: true,
    data: {
      applicationId: body.applicationId,
      emailSent: sendResult.sent,
      suppressed: sendResult.suppressed,
      aiProcessed: ai.ok,
    },
  });
});
