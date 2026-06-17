/**
 * cvp-staff-reply
 *
 * Staff sends a threaded reply to an applicant's inbound email. Two-step
 * usage mirrors the decision modal:
 *
 *   POST { ...body, dryRun: true }
 *   -> returns { aiDraftPlain, subject, html, text } without sending.
 *   -> used when useAIDraft=true to populate the compose textarea.
 *
 *   POST { ...body, body: "final copy" }
 *   -> sends the reply via Mailgun with proper In-Reply-To / References
 *      headers, logs to cvp_outbound_messages (threaded to the original
 *      outbound when known).
 *
 * Body:
 *   applicationId      (required)
 *   inboundEmailId     (required) — the inbound we're replying TO
 *   subject?           defaults to "Re: <inbound.subject>"
 *   body?              plain text applicant-facing message (if not useAIDraft)
 *   useAIDraft?        when true, Opus drafts the body using conversation
 *                      context + optional guidance in aiInstructions
 *   aiInstructions?    optional string steering the AI draft
 *   dryRun?            preview only
 *   editedSubject?     override rendered subject
 *   editedBody?        override the AI/plain body text
 *
 * Auth: requires a signed-in staff Authorization: Bearer JWT — see
 * `_shared/require-staff.ts`. `staffId` is derived from auth context, not
 * trusted from the body.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendMailgunEmail } from "../_shared/mailgun.ts";
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

const BRAND_TEAL = "#0891B2";
const BRAND_BORDER = "#E5E7EB";
const BRAND_MUTED = "#6B7280";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapStaffReply(plainBody: string): { html: string; text: string } {
  const supportEmail = Deno.env.get("CVP_SUPPORT_EMAIL") ?? "vm@cethos.com";
  const paragraphs = plainBody
    .split(/\n\n+/)
    .map((p) => `<p style="margin:8px 0;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F9FAFB;padding:24px 12px;">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:28px 28px;border:1px solid ${BRAND_BORDER};border-radius:8px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="font-size:14px;line-height:1.55;">${paragraphs}</div>
  <p style="color:${BRAND_MUTED};font-size:12px;margin-top:24px;border-top:1px solid ${BRAND_BORDER};padding-top:12px;">
    Questions? Reply to this email or contact <a href="mailto:${esc(supportEmail)}" style="color:${BRAND_TEAL};">${esc(supportEmail)}</a>.
  </p>
</div>
</body></html>`;
  return { html, text: plainBody };
}

const STAFF_DRAFT_SYSTEM_PROMPT = `You are drafting a reply that CETHOS vendor-management staff will send to an applicant who replied to an earlier CETHOS recruitment email.

Write 2–5 short paragraphs of plain text, warm but professional, addressing:
- The applicant's stated question(s) or concern(s)
- Any next step the applicant should take (reply with X, send Y, wait for Z)

Do NOT:
- Copy internal jargon, scoring numbers, AI flags, or staff-only reasoning
- Make promises about timing unless the staff's instructions explicitly include one
- Include a salutation line ("Hi Name,") or signoff — the template wraps them

If the applicant's reply is unclear or confrontational, acknowledge receipt and ask a clarifying question rather than committing to an action. Staff reviews + edits before sending, so err on the side of short, neutral, and easy to adjust.

Return ONLY the plain-text body. No markdown, no JSON, no preamble.`;

async function draftWithOpus(args: {
  applicantName: string;
  applicationNumber: string;
  originalOutboundSubject: string;
  originalOutboundBody: string;
  inboundSubject: string;
  inboundBody: string;
  aiReplyAnalysis: Record<string, unknown> | null;
  staffInstructions: string;
}): Promise<{ ok: boolean; text: string | null; error: string | null }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, text: null, error: "ANTHROPIC_API_KEY not configured" };

  const analysisSummary = args.aiReplyAnalysis
    ? JSON.stringify(args.aiReplyAnalysis).slice(0, 1500)
    : "(none)";
  const userMessage = `Applicant: ${args.applicantName}
Application: ${args.applicationNumber}

--- CETHOS previously sent ---
Subject: ${args.originalOutboundSubject}
Body (excerpt):
${args.originalOutboundBody.slice(0, 1500)}

--- Applicant replied ---
Subject: ${args.inboundSubject}
Body:
${args.inboundBody.slice(0, 3000)}

--- AI analysis of the reply ---
${analysisSummary}

--- Staff instructions for this draft ---
${args.staffInstructions || "(none — use your best judgement on tone + next step)"}`;

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
        max_tokens: 800,
        system: STAFF_DRAFT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, text: null, error: `${resp.status}: ${body.slice(0, 400)}` };
    }
    const data = (await resp.json()) as { content: { type: string; text?: string }[] };
    const text = (data.content ?? []).find((c) => c.type === "text")?.text?.trim() ?? "";
    return text ? { ok: true, text, error: null } : { ok: false, text: null, error: "empty draft" };
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
    inboundEmailId?: string;
    subject?: string;
    body?: string;
    useAIDraft?: boolean;
    aiInstructions?: string;
    editedSubject?: string;
    editedBody?: string;
    dryRun?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  if (!body.applicationId) return json({ success: false, error: "applicationId_required" }, 400);
  if (!body.inboundEmailId) return json({ success: false, error: "inboundEmailId_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Load the inbound we're replying to + the linked outbound (if any) for
  // conversational context.
  const { data: inbound, error: inboundErr } = await supabase
    .from("cvp_inbound_emails")
    .select(
      "id, subject, body_plain, stripped_text, message_id, from_email, from_name, matched_outbound_id, ai_reply_analysis",
    )
    .eq("id", body.inboundEmailId)
    .maybeSingle();
  if (inboundErr || !inbound) {
    return json({ success: false, error: "inbound_not_found" }, 404);
  }

  let originalOutbound: Record<string, unknown> | null = null;
  if (inbound.matched_outbound_id) {
    const { data: ob } = await supabase
      .from("cvp_outbound_messages")
      .select("subject, body_text, body_html, message_id, template_tag")
      .eq("id", inbound.matched_outbound_id)
      .maybeSingle();
    originalOutbound = ob ?? null;
  }

  const { data: app } = await supabase
    .from("cvp_applications")
    .select("id, email, full_name, application_number")
    .eq("id", body.applicationId)
    .single();
  if (!app) return json({ success: false, error: "application_not_found" }, 404);

  // If asked, produce an Opus draft BEFORE returning preview / sending.
  let aiDraft: string | null = null;
  let aiError: string | null = null;
  if (body.useAIDraft) {
    const d = await draftWithOpus({
      applicantName: String(app.full_name ?? ""),
      applicationNumber: String(app.application_number ?? ""),
      originalOutboundSubject: (originalOutbound?.subject as string) ?? "",
      originalOutboundBody: (originalOutbound?.body_text as string) ?? "",
      inboundSubject: (inbound.subject as string) ?? "",
      inboundBody: (inbound.stripped_text as string) ?? (inbound.body_plain as string) ?? "",
      aiReplyAnalysis: inbound.ai_reply_analysis as Record<string, unknown> | null,
      staffInstructions: body.aiInstructions ?? "",
    });
    aiDraft = d.ok ? d.text : null;
    aiError = d.ok ? null : d.error;
  }

  const finalBody = (body.editedBody ?? body.body ?? aiDraft ?? "").trim();
  const defaultSubject = inbound.subject
    ? `Re: ${String(inbound.subject).replace(/^Re:\s*/i, "")}`
    : "Re: Your message";
  const subject = (body.editedSubject ?? body.subject ?? defaultSubject).trim() || defaultSubject;

  const rendered = wrapStaffReply(finalBody || "(empty body)");

  // ---- Preview mode ----
  if (body.dryRun === true) {
    return json({
      success: true,
      data: {
        dryRun: true,
        aiDraftPlain: aiDraft,
        aiError,
        subject,
        html: rendered.html,
        text: rendered.text,
        inboundMessageId: inbound.message_id,
        originalOutboundMessageId: (originalOutbound?.message_id as string | undefined) ?? null,
      },
    });
  }

  if (!finalBody) {
    return json({ success: false, error: "body_required_for_send" }, 400);
  }

  // Build threading headers: In-Reply-To = applicant's Message-Id; References
  // = original outbound id (if any) + inbound Message-Id.
  const inReplyTo = (inbound.message_id as string | null) ?? undefined;
  const references: string[] = [];
  if (originalOutbound?.message_id) {
    references.push(String(originalOutbound.message_id));
  }
  if (inbound.message_id) {
    references.push(String(inbound.message_id));
  }

  const sendResult = await sendMailgunEmail({
    to: {
      email: String(inbound.from_email ?? app.email),
      name: String(inbound.from_name ?? app.full_name ?? undefined),
    },
    subject,
    html: rendered.html,
    text: rendered.text,
    respectDoNotContactFor: String(app.email),
    tags: ["staff-reply", String(body.applicationId)],
    inReplyTo,
    references,
    trackContext: {
      applicationId: String(body.applicationId),
      templateTag: "staff-reply",
      staffUserId: staffId,
    },
  });

  // Stamp the inbound as acknowledged by the staff replying.
  if (sendResult.sent) {
    await supabase
      .from("cvp_inbound_emails")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: staffId,
      })
      .eq("id", body.inboundEmailId);
  }

  return json({
    success: true,
    data: {
      emailSent: sendResult.sent,
      suppressed: sendResult.suppressed,
      mailgunId: sendResult.mailgunId,
      aiDraftUsed: Boolean(aiDraft && !body.editedBody && !body.body),
    },
  });
});
