/**
 * cvp-request-references
 *
 * Staff invokes from the admin RecruitmentDetail "References" section.
 * Two-mode flow (mirrors cvp-staff-reply / cvp-approve-application):
 *
 *   POST { applicationId, useAIDraft?, dryRun: true }
 *     → returns { aiDraftMessage, subject, html, text } for preview
 *
 *   POST { applicationId, staffMessage, editedSubject?, editedBody? }
 *     → creates a cvp_application_reference_requests row
 *     → sends V18 to the applicant with a request_token link
 *
 * Body fields:
 *   applicationId        (required)
 *   staffMessage?        plain-text message that goes inside V18 (overrides AI draft)
 *   useAIDraft?          generate via Opus
 *   aiInstructions?      guide for the AI draft
 *   dryRun?              preview only
 *   editedSubject?
 *   editedBody?          alias for staffMessage when sending after preview
 *
 * Auth: requires Authorization: Bearer <staff JWT>; staffId derived from
 * auth context via `_shared/require-staff.ts`.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
import { buildV18ReferencesRequest } from "../_shared/email-templates.ts";
import { MODEL_QUALITY } from "../_shared/ai-models.ts";
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

const APPLICANT_URL_FALLBACK = "https://join.cethos.com";

const AI_DRAFT_SYSTEM_PROMPT = `You are drafting the body of a CETHOS email asking an applicant to share 2–3 professional references. Audience: a translator who has cleared early steps of our recruitment pipeline; warm, respectful, professional.

Hard rules:
- Output only the body text. No salutation ("Hi Name,"), no signoff — the email template wraps these.
- 2–4 short paragraphs. No bullets unless the user's instructions specifically call for them.
- Mention what kinds of references are useful (former clients, project managers, peer translators) and the timing — "no rush, but the sooner the better".
- If staff instructions name specific information to gather (e.g. "ask about their CAT-tool fluency"), weave that in naturally without making it feel like a checklist.
- Do NOT promise outcomes. Do NOT state when the application will be decided.

Output: plain text only.`;

async function draftWithOpus(args: {
  applicantName: string;
  applicationNumber: string;
  staffInstructions: string;
}): Promise<{ ok: boolean; text: string | null; error: string | null }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, text: null, error: "ANTHROPIC_API_KEY not configured" };

  const userMessage = `Applicant: ${args.applicantName}
Application: ${args.applicationNumber}

Staff instructions for this draft (optional):
${args.staffInstructions || "(none — use your professional judgement)"}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_QUALITY,
        max_tokens: 600,
        system: AI_DRAFT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, text: null, error: `${resp.status}: ${body.slice(0, 400)}` };
    }
    const data = (await resp.json()) as { content: { type: string; text?: string }[] };
    const text =
      (data.content ?? []).find((c) => c.type === "text")?.text?.trim() ?? "";
    return text
      ? { ok: true, text, error: null }
      : { ok: false, text: null, error: "empty draft" };
  } catch (err) {
    return { ok: false, text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const authed = await requireStaff(req);
  if (!authed.ok) return json({ success: false, error: authed.error }, authed.status);
  const staffId = authed.staff.staffId;

  let body: {
    applicationId?: string;
    staffMessage?: string;
    useAIDraft?: boolean;
    aiInstructions?: string;
    dryRun?: boolean;
    editedSubject?: string;
    editedBody?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }
  if (!body.applicationId) return json({ success: false, error: "applicationId_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: app, error: appErr } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number")
    .eq("id", body.applicationId)
    .single();
  if (appErr || !app) return json({ success: false, error: "application_not_found" }, 404);

  // AI draft
  let aiDraft: string | null = null;
  let aiError: string | null = null;
  if (body.useAIDraft) {
    const d = await draftWithOpus({
      applicantName: app.full_name,
      applicationNumber: app.application_number,
      staffInstructions: body.aiInstructions ?? "",
    });
    aiDraft = d.ok ? d.text : null;
    aiError = d.ok ? null : d.error;
  }

  // Final body comes from (in order): editedBody > staffMessage > aiDraft.
  const finalBody = (body.editedBody ?? body.staffMessage ?? aiDraft ?? "").trim();

  // Generate request_token in advance so dryRun can render the same URL
  // shape the real send will use (we only persist on real send).
  const previewToken = "00000000-0000-0000-0000-PREVIEWPREVIEW";
  const expiryDays = 14;

  const appUrl = Deno.env.get("APP_URL") ?? APPLICANT_URL_FALLBACK;

  if (body.dryRun === true) {
    const tpl = buildV18ReferencesRequest({
      fullName: app.full_name,
      applicationNumber: app.application_number,
      staffMessage: finalBody || null,
      contactsLinkUrl: `${appUrl}/references/${previewToken}`,
      expiryDays,
    });
    const subject = (body.editedSubject ?? "").trim() || tpl.subject;
    return json({
      success: true,
      data: {
        dryRun: true,
        aiDraftMessage: aiDraft,
        aiError,
        subject,
        html: tpl.html,
        text: tpl.text,
      },
    });
  }

  // ---- Real send ----
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: requestRow, error: insErr } = await supabase
    .from("cvp_application_reference_requests")
    .insert({
      application_id: body.applicationId,
      request_token_expires_at: expiresAt,
      staff_id: staffId,
      staff_message: finalBody || null,
      ai_drafted_message: aiDraft,
      status: "sent",
    })
    .select("id, request_token")
    .single();
  if (insErr || !requestRow) {
    return json({ success: false, error: "request_create_failed", detail: insErr?.message }, 500);
  }

  const tpl = buildV18ReferencesRequest({
    fullName: app.full_name,
    applicationNumber: app.application_number,
    staffMessage: finalBody || null,
    contactsLinkUrl: `${appUrl}/references/${requestRow.request_token}`,
    expiryDays,
  });
  const subject = (body.editedSubject ?? "").trim() || tpl.subject;

  const sendResult = await sendMailgunEmail({
    to: { email: app.email, name: app.full_name },
    subject,
    html: tpl.html,
    text: tpl.text,
    respectDoNotContactFor: app.email,
    tags: ["v18-references-request", body.applicationId],
    trackContext: {
      applicationId: body.applicationId,
      templateTag: "v18-references-request",
      staffUserId: staffId,
    },
  });

  return json({
    success: true,
    data: {
      requestId: requestRow.id,
      requestToken: requestRow.request_token,
      emailSent: sendResult.sent,
      suppressed: sendResult.suppressed,
      mailgunId: sendResult.mailgunId,
    },
  });
});
